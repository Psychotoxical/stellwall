import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { and, asc, eq, lt } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { documents } from "../db/schema.ts";
import type { Notifier } from "../shopping/notify.ts";
import { decryptFrom } from "./crypto.ts";

/** Reads the text of one file; the signal ends a run that takes too long. */
export type OcrRunner = (input: string, mime: string, signal: AbortSignal) => Promise<{ text: string; pages: number }>;

export const MAX_TRIES = 3;
const TIMEOUT_MS = 5 * 60_000;
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

/** Runs a program; its output is decoded once at the end, so a letter split across chunks stays whole. */
export function exec(cmd: string, args: string[], signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { signal, stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (c: Buffer) => out.push(c));
    p.stderr.on("data", (c: Buffer) => (err = (err + c.toString("utf8")).slice(-2000)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out).toString("utf8")) : reject(new Error(`${cmd} exited ${code}: ${err}`))));
  });
}

/**
 * OCRmyPDF adds a text layer where a page has none (German and English), then pdftotext
 * reads all text, the recognized and the one the PDF already had.
 */
export const ocrmypdf: OcrRunner = async (input, mime, signal) => {
  const out = `${input}.ocr.pdf`;
  const args = ["--skip-text", "-l", "deu+eng", "--output-type", "pdf", "--optimize", "0", "--quiet"];
  if (mime !== "application/pdf") args.push("--image-dpi", "300");
  await exec("ocrmypdf", [...args, input, out], signal);
  const text = await exec("pdftotext", ["-enc", "UTF-8", out, "-"], signal);
  const info = await exec("pdfinfo", [out], signal);
  const pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 0) || null;
  return { text: text.replace(/\f/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), pages: pages ?? 0 };
};

/**
 * One document at a time, oldest first. A failure counts a try; after MAX_TRIES the document
 * is "failed" and stays findable by name and category. Waiting documents survive a restart.
 */
export function createOcr(opts: { db: Db; dir: string; key: Buffer; run: OcrRunner; notify: Notifier; timeoutMs?: number }) {
  const { db, dir, key, run, notify } = opts;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  let running: Promise<void> | null = null;

  async function one(): Promise<boolean> {
    const row = (await db.select().from(documents).where(and(eq(documents.ocrState, "pending"), lt(documents.ocrTries, MAX_TRIES))).orderBy(asc(documents.createdAt)).limit(1))[0];
    if (!row) return false;
    const tmp = await mkdtemp(join(tmpdir(), "sw-ocr-"));
    const input = join(tmp, `in.${EXT[row.mime] ?? "bin"}`);
    try {
      await pipeline(decryptFrom(join(dir, row.id), key), createWriteStream(input, { mode: 0o600 }));
      const signal = AbortSignal.timeout(timeoutMs);
      const r = await run(input, row.mime, signal);
      await db.update(documents).set({ text: r.text || null, pages: r.pages || null, ocrState: "done" }).where(eq(documents.id, row.id));
    } catch {
      const tries = row.ocrTries + 1;
      await db.update(documents).set({ ocrTries: tries, ocrState: tries >= MAX_TRIES ? "failed" : "pending" }).where(eq(documents.id, row.id));
      return false;
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
    notify.documents(row.id);
    return true;
  }

  /** Works until nothing is left or a document failed (it is tried again on the next wake). */
  async function work() {
    while (await one()) {
      /* next */
    }
  }

  return {
    /** Starts working if it is not already. */
    wake: () => void (running ??= work().catch(() => {}).finally(() => (running = null))),
    /** Works now and waits; for tests and the timer. */
    drain: async () => {
      if (running) await running;
      running = work().finally(() => (running = null));
      await running;
    },
  };
}
