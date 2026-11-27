import { describe, it } from "vitest";
import { eq } from "drizzle-orm";
import { as, setupFamily } from "./family.ts";
import { contract } from "./contract.ts";
import { createDocsApp, upload } from "./documents-helpers.ts";
import { createTestApp } from "./helpers.ts";
import { documents } from "../src/db/schema.ts";

describe("contract: documents", () => {
  it("writes the document examples the apps parse", async () => {
    const at = new Date("2026-11-27T10:00:00Z");
    const { app, db } = await createDocsApp({ now: () => at });
    const f = await setupFamily(app);
    const a = as(app, f.alex.cookie);
    const created = await upload(app, f.alex.cookie, { name: "Hausrat", category: "Versicherung", validUntil: "2027-03-01", remindDays: 30 });
    contract("document-created", created);
    const id = created.json().id as string;
    await db.update(documents).set({ text: "Versicherungsschein für den Hausrat, Beitrag monatlich.", ocrState: "done", pages: 2 }).where(eq(documents.id, id));
    await upload(app, f.alex.cookie, { name: "Zeugnis", category: null, visibility: { everyone: false, memberIds: [f.sam.id] } });
    contract("documents", await a.get("/api/documents"));
    contract("documents-search", await a.get("/api/documents?q=Beitrag"));
    contract("document", await a.get(`/api/documents/${id}`));
    contract("document-categories", await a.get("/api/document-categories"));
    contract("document-updated", await a.patch(`/api/documents/${id}`, { name: "Hausratversicherung", remindDays: 90 }));
    const off = await createTestApp();
    const g = await setupFamily(off.app);
    contract("documents-not-configured", await as(off.app, g.alex.cookie).get("/api/documents"));
  });
});
