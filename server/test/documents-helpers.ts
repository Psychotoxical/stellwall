import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createTestApp, testConfig } from "./helpers.ts";
import { H } from "./auth-helpers.ts";

/** A tiny but real PDF; the words are what tests search for. */
export function pdf(words = "Hallo") {
  return Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n% ${words}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
}

export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(64)]);

export async function docsConfig() {
  const dir = await mkdtemp(join(tmpdir(), "sw-docs-"));
  const keyFile = join(dir, "documents.key");
  await writeFile(keyFile, randomBytes(32));
  return { ...testConfig, docsDir: join(dir, "files"), docsKeyFile: keyFile, dir };
}

export async function createDocsApp(opts: Parameters<typeof createTestApp>[0] = {}) {
  const config = await docsConfig();
  const t = await createTestApp({ ...opts, config });
  return { ...t, config };
}

export function multipart(fields: Record<string, string>, file?: { name: string; data: Buffer; type?: string }) {
  const boundary = "----stellwall" + randomBytes(8).toString("hex");
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (file) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type ?? "application/octet-stream"}\r\n\r\n`));
    parts.push(file.data, Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

export type Meta = { name: string; category?: string | null; validUntil?: string | null; remindDays?: number; visibility?: { everyone: boolean; memberIds: string[] } };

export function upload(app: FastifyInstance, cookie: string, meta: Meta, data: Buffer = pdf(), name = "scan.pdf") {
  const body = multipart({ meta: JSON.stringify({ visibility: { everyone: true, memberIds: [] }, ...meta }) }, { name, data });
  return app.inject({ method: "POST", url: "/api/documents", headers: { ...H, cookie, ...body.headers }, payload: body.payload });
}
