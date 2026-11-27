import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { as, setupFamily } from "./family.ts";
import { createDocsApp, pdf, upload } from "./documents-helpers.ts";
import { documents } from "../src/db/schema.ts";
import { createOcr, type OcrRunner } from "../src/documents/ocr.ts";
import { readKey } from "../src/documents/routes.ts";
import { silent } from "../src/shopping/notify.ts";

async function setup(run: OcrRunner, timeoutMs?: number) {
  const t = await createDocsApp();
  const f = await setupFamily(t.app);
  const key = (await readKey(t.config.docsKeyFile))!;
  const ocr = createOcr({ db: t.db, dir: t.config.docsDir!, key, run, notify: silent, ...(timeoutMs ? { timeoutMs } : {}) });
  return { ...t, f, ocr };
}

const names = async (app: Parameters<typeof as>[0], cookie: string, q: string) =>
  ((await as(app, cookie).get(`/api/documents?q=${encodeURIComponent(q)}`)).json() as { name: string }[]).map((d) => d.name);

describe("text recognition", () => {
  it("a new document gets its text and becomes findable by it", async () => {
    const seen: string[] = [];
    const { app, db, f, ocr } = await setup(async (input, mime) => {
      seen.push(mime);
      expect((await readFile(input)).subarray(0, 5).toString()).toBe("%PDF-");
      return { text: "Rechnung der Stadtwerke über Fernwärme", pages: 1 };
    });
    const id = (await upload(app, f.alex.cookie, { name: "Scan" }, pdf())).json().id as string;
    await ocr.drain();
    expect(seen).toEqual(["application/pdf"]);
    const row = (await db.select().from(documents).where(eq(documents.id, id)))[0]!;
    expect(row).toMatchObject({ ocrState: "done", pages: 1, ocrTries: 0 });
    expect(await names(app, f.alex.cookie, "Fernwärme")).toEqual(["Scan"]);
  });

  it("a failing runner is retried and ends as failed after 3 tries; the document stays findable by name", async () => {
    let calls = 0;
    const { app, db, f, ocr } = await setup(async () => {
      calls++;
      throw new Error("tesseract broke");
    });
    const id = (await upload(app, f.alex.cookie, { name: "Kaputter Scan" })).json().id as string;
    for (let i = 0; i < 5; i++) await ocr.drain();
    expect(calls).toBe(3);
    expect((await db.select().from(documents).where(eq(documents.id, id)))[0]).toMatchObject({ ocrState: "failed", ocrTries: 3 });
    expect(await names(app, f.alex.cookie, "Kaputter")).toEqual(["Kaputter Scan"]);
  });

  it("a runner that hangs is stopped after the time limit", async () => {
    let aborted = false;
    const { app, db, f, ocr } = await setup(
      (_i, _m, signal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        }),
      50,
    );
    const id = (await upload(app, f.alex.cookie, { name: "Hängt" })).json().id as string;
    await ocr.drain();
    expect(aborted).toBe(true);
    expect((await db.select().from(documents).where(eq(documents.id, id)))[0]).toMatchObject({ ocrState: "pending", ocrTries: 1 });
  });

  it("pending documents are picked up again after a restart", async () => {
    const first = await setup(async () => ({ text: "", pages: 1 }));
    const id = (await upload(first.app, first.f.alex.cookie, { name: "Liegengeblieben" })).json().id as string;
    // A second queue (the restarted app) finds the waiting document on its own.
    const again = createOcr({ db: first.db, dir: first.config.docsDir!, key: (await readKey(first.config.docsKeyFile))!, run: async () => ({ text: "Mietvertrag", pages: 3 }), notify: silent });
    await again.drain();
    expect((await first.db.select().from(documents).where(eq(documents.id, id)))[0]).toMatchObject({ ocrState: "done", pages: 3, text: "Mietvertrag" });
  });
});
