import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";
import { PNG, createDocsApp, pdf, upload } from "./documents-helpers.ts";
import { documents } from "../src/db/schema.ts";

type Doc = { id: string; name: string; category: string | null; snippet?: string; ocr: string; mime: string };

describe("documents", () => {
  it("upload stores only ciphertext on disk and the file comes back the same", async () => {
    const { app, config } = await createDocsApp();
    const f = await setupFamily(app);
    const data = pdf("Versicherungsschein Hausrat");
    const r = await upload(app, f.alex.cookie, { name: "Hausrat", category: "Versicherung", validUntil: "2027-03-01" }, data);
    expect(r.statusCode).toBe(200);
    const doc = r.json() as Doc;
    expect(doc).toMatchObject({ name: "Hausrat", category: "Versicherung", mime: "application/pdf", ocr: "pending" });
    expect(await readdir(config.docsDir!)).toEqual([doc.id]);
    const disk = await readFile(`${config.docsDir}/${doc.id}`);
    expect(disk.includes(Buffer.from("Versicherungsschein"))).toBe(false);
    const back = await as(app, f.sam.cookie).get(`/api/documents/${doc.id}/file`);
    expect(back.statusCode).toBe(200);
    expect(back.headers["content-type"]).toBe("application/pdf");
    expect(back.headers["content-disposition"]).toContain("inline");
    expect(back.rawPayload.equals(data)).toBe(true);
    expect((await as(app, f.sam.cookie).get(`/api/documents/${doc.id}/file?download=1`)).headers["content-disposition"]).toContain("attachment");
    expect((await upload(app, f.alex.cookie, { name: "Bild" }, PNG, "foto.png")).json().mime).toBe("image/png");
  });

  it("type is read from the bytes: a renamed text file is 415 unsupported_type", async () => {
    const { app, config } = await createDocsApp();
    const f = await setupFamily(app);
    const r = await upload(app, f.alex.cookie, { name: "Fake" }, Buffer.from("MZ this is no pdf"), "rechnung.pdf");
    expect(r.statusCode).toBe(415);
    expect(r.json()).toEqual({ error: "unsupported_type" });
    expect(await readdir(config.docsDir!)).toEqual([]);
  });

  it("over 30 MB is 413 too_large and leaves no file behind", async () => {
    const { app, config } = await createDocsApp();
    const f = await setupFamily(app);
    const big = Buffer.concat([pdf(), Buffer.alloc(30 * 1024 * 1024 + 1 - pdf().length)]);
    const r = await upload(app, f.alex.cookie, { name: "Groß" }, big);
    expect(r.statusCode).toBe(413);
    expect(await readdir(config.docsDir!)).toEqual([]);
    expect(((await as(app, f.alex.cookie).get("/api/documents")).json() as unknown[]).length).toBe(0);
  });

  it("without a key file the API says documents_not_configured", async () => {
    const { app } = await createTestApp();
    const f = await setupFamily(app);
    expect((await as(app, f.alex.cookie).get("/api/documents")).json()).toEqual({ error: "documents_not_configured" });
    expect((await upload(app, f.alex.cookie, { name: "x" })).statusCode).toBe(409);
  });

  it("a private document is invisible to others in list, search, get and file (404)", async () => {
    const { app } = await createDocsApp();
    const f = await setupFamily(app);
    const mine = (await upload(app, f.alex.cookie, { name: "Geheimvertrag", visibility: { everyone: false, memberIds: [f.kim.id] } })).json() as Doc;
    const s = as(app, f.sam.cookie);
    expect((await s.get("/api/documents")).json()).toEqual([]);
    expect((await s.get("/api/documents?q=Geheimvertrag")).json()).toEqual([]);
    expect((await s.get(`/api/documents/${mine.id}`)).statusCode).toBe(404);
    expect((await s.get(`/api/documents/${mine.id}/file`)).statusCode).toBe(404);
    expect(((await as(app, f.kim.cookie).get("/api/documents")).json() as Doc[]).map((d) => d.name)).toEqual(["Geheimvertrag"]);
  });

  it("only the creator deletes or changes visibility; others edit name, category and date", async () => {
    const { app, config } = await createDocsApp();
    const f = await setupFamily(app);
    const d = (await upload(app, f.alex.cookie, { name: "Fahrzeugschein" })).json() as Doc;
    const s = as(app, f.sam.cookie);
    expect((await s.patch(`/api/documents/${d.id}`, { name: "Fahrzeugschein Golf", category: "Auto", validUntil: "2028-01-31", remindDays: 90 })).json()).toMatchObject({ name: "Fahrzeugschein Golf", category: "Auto", validUntil: "2028-01-31", remindDays: 90 });
    expect((await s.patch(`/api/documents/${d.id}`, { visibility: { everyone: false, memberIds: [] } })).statusCode).toBe(403);
    expect((await s.patch(`/api/documents/${d.id}`, { remindDays: 14 })).statusCode).toBe(400);
    expect((await s.del(`/api/documents/${d.id}`)).statusCode).toBe(403);
    expect((await as(app, f.alex.cookie).del(`/api/documents/${d.id}`)).statusCode).toBe(200);
    expect(await readdir(config.docsDir!)).toEqual([]);
  });

  it("search finds a stem, a prefix and a word only in the recognized text", async () => {
    const { app, db } = await createDocsApp();
    const f = await setupFamily(app);
    const a = as(app, f.alex.cookie);
    const ins = (await upload(app, f.alex.cookie, { name: "Kfz-Versicherung", category: "Versicherung" })).json() as Doc;
    const scan = (await upload(app, f.alex.cookie, { name: "Scan vom Montag" })).json() as Doc;
    await upload(app, f.alex.cookie, { name: "Zeugnis Größe", category: "Schule/Arbeit" });
    await db.update(documents).set({ text: "Die Stadtwerke berechnen den Abschlag für Fernwärme.", ocrState: "done" }).where(eq(documents.id, scan.id));
    const names = async (q: string) => ((await a.get(`/api/documents?q=${encodeURIComponent(q)}`)).json() as Doc[]).map((d) => d.name);
    expect(await names("Versicherungen")).toEqual(["Kfz-Versicherung"]);
    expect(await names("Versich")).toEqual(["Kfz-Versicherung"]);
    // While typing: every longer prefix keeps finding it, also past the stem.
    for (const typed of ["Versicheru", "Versicherun", "Kfz-Vers"]) expect(await names(typed), typed).toEqual(["Kfz-Versicherung"]);
    expect(await names("fernwärme")).toEqual(["Scan vom Montag"]);
    expect(await names("größe")).toEqual(["Zeugnis Größe"]);
    expect(await names("!!")).toHaveLength(3);
    const hit = ((await a.get("/api/documents?q=Abschlag")).json() as Doc[])[0]!;
    expect(hit.snippet).toContain("«Abschlag»");
    expect(((await a.get("/api/documents?category=Versicherung")).json() as Doc[]).map((d) => d.id)).toEqual([ins.id]);
    expect(((await a.get("/api/document-categories")).json() as string[]).slice(0, 2)).toEqual(["Versicherung", "Auto"]);
  });
});
