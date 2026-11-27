import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { alex, fakeApi, renderAt, sam } from "../test-utils.tsx";
import { de } from "../text/de.ts";
import type { DocumentDto } from "../documents-api.ts";

afterEach(() => vi.unstubAllGlobals());

const doc = (over: Partial<DocumentDto> = {}): DocumentDto => ({
  id: "d1", name: "Hausrat", category: "Versicherung", validUntil: "2027-03-01", remindDays: 30, visibility: { everyone: true, memberIds: [] },
  createdBy: "a1", createdAt: "2026-11-27T10:00:00.000Z", updatedAt: "2026-11-27T10:00:00.000Z", mime: "application/pdf", size: 201, pages: 2, ocr: "done", ...over,
});

function base(docs: DocumentDto[] = [doc()], me = alex) {
  return {
    "GET /api/me": () => ({ status: 200, body: me }),
    "GET /api/members": () => ({ status: 200, body: [alex, sam] }),
    "GET /api/documents?*": () => ({ status: 200, body: docs }),
    "GET /api/document-categories": () => ({ status: 200, body: ["Versicherung", "Auto"] }),
  };
}

describe("documents", () => {
  it("upload sends meta and file", async () => {
    const calls = fakeApi({ ...base([]), "POST /api/documents": () => ({ status: 200, body: doc() }) });
    renderAt("/dokumente");
    fireEvent.click(await screen.findByRole("button", { name: de.documents.upload }));
    const dialog = await screen.findByRole("dialog");
    const file = new File(["%PDF-1.4"], "Hausrat_2026.pdf", { type: "application/pdf" });
    fireEvent.change(within(dialog).getByLabelText(de.documents.file), { target: { files: [file] } });
    expect((within(dialog).getByLabelText(de.documents.name) as HTMLInputElement).value).toBe("Hausrat 2026");
    fireEvent.change(within(dialog).getByLabelText(de.documents.category), { target: { value: "Versicherung" } });
    fireEvent.change(within(dialog).getByLabelText(new RegExp(de.documents.validUntil)), { target: { value: "2027-03-01" } });
    fireEvent.change(within(dialog).getByLabelText(de.documents.remind), { target: { value: "90" } });
    fireEvent.click(within(dialog).getByRole("button", { name: de.members.save }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/documents")).toBeTruthy());
    const sent = calls.find((c) => c.key === "POST /api/documents")!.body as { meta: unknown; file: File };
    expect(sent.meta).toEqual({ name: "Hausrat 2026", category: "Versicherung", validUntil: "2027-03-01", remindDays: 90, visibility: { everyone: true, memberIds: [] } });
    expect(sent.file.name).toBe("Hausrat_2026.pdf");
  });

  it("choosing who may see it keeps the upload dialog open", async () => {
    fakeApi({ ...base([]) });
    renderAt("/dokumente");
    fireEvent.click(await screen.findByRole("button", { name: de.documents.upload }));
    const dialog = await screen.findByRole("dialog", { name: de.documents.upload });
    fireEvent.click(within(dialog).getByRole("button", { name: new RegExp(de.visibility.all) }));
    const sheet = await screen.findByRole("dialog", { name: de.visibility.title });
    fireEvent.click(within(sheet).getByLabelText(new RegExp(de.visibility.me)));
    fireEvent.click(within(sheet).getByRole("button", { name: de.members.save }));
    // The sheet closes like a browser does it: with a close event on its own dialog.
    fireEvent(sheet, new Event("close"));
    expect(screen.getByRole("dialog", { name: de.documents.upload })).toBeTruthy();
    expect(within(screen.getByRole("dialog", { name: de.documents.upload })).getByRole("button", { name: new RegExp(de.visibility.me) })).toBeTruthy();
  });

  it("search shows the snippet", async () => {
    const calls = fakeApi({ ...base([doc({ snippet: "Beitrag «monatlich» fällig" })]) });
    renderAt("/dokumente");
    fireEvent.change(await screen.findByRole("searchbox", { name: de.documents.search }), { target: { value: "monatlich" } });
    await waitFor(() => expect(calls.some((c) => c.key === "GET /api/documents?q=monatlich")).toBe(true));
    expect(await screen.findByText("Beitrag «monatlich» fällig")).toBeTruthy();
  });

  it("a document of someone else has no delete button", async () => {
    fakeApi({ ...base([], sam), "GET /api/documents/d1": () => ({ status: 200, body: doc() }) });
    renderAt("/dokumente/d1");
    expect(await screen.findByRole("heading", { name: "Hausrat" })).toBeTruthy();
    expect(screen.getByRole("link", { name: de.documents.download }).getAttribute("href")).toBe("/api/documents/d1/file?download=1");
    expect(screen.queryByRole("button", { name: de.documents.delete })).toBeNull();
  });

  it("without key the page says the administration must set it up", async () => {
    fakeApi({ ...base(), "GET /api/documents?*": () => ({ status: 409, body: { error: "documents_not_configured" } }) });
    renderAt("/dokumente");
    expect(await screen.findByText(de.documents.notConfigured)).toBeTruthy();
    expect(screen.queryByRole("button", { name: de.documents.upload })).toBeNull();
  });
});
