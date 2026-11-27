import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { alex, fakeApi, renderAt, sam } from "../test-utils.tsx";
import { de } from "../text/de.ts";
import type { ItemDto } from "../shopping-api.ts";

afterEach(() => vi.unstubAllGlobals());

const list = { id: "l1", name: "Einkauf", visibility: { everyone: true, memberIds: [] }, createdBy: "a1", openCount: 1 };
const milk: ItemDto = { id: "i1", listId: "l1", name: "Milch", quantity: "1 l", category: "Kühlregal", addedBy: "s1", addedAt: "2026-11-26T09:00:00Z", checkedAt: null, checkedBy: null };

function base(items: unknown[] = [milk]) {
  return {
    "GET /api/me": () => ({ status: 200, body: alex }),
    "GET /api/members": () => ({ status: 200, body: [alex, sam] }),
    "GET /api/lists": () => ({ status: 200, body: [list] }),
    "GET /api/lists/l1/items": () => ({ status: 200, body: items }),
    "GET /api/board": () => ({ status: 200, body: [] }),
    "POST /api/board/seen": () => ({ status: 200, body: { ok: true } }),
  };
}

describe("shopping", () => {
  it("shows items with who added them", async () => {
    fakeApi(base());
    renderAt("/einkauf");
    expect(await screen.findByText("Milch")).toBeInTheDocument();
    expect(screen.getByText(de.shopping.from("Sam"))).toBeInTheDocument();
    expect(screen.getByText("1 l")).toBeInTheDocument();
  });

  it("typing shows suggestions and Enter adds", async () => {
    const calls = fakeApi({
      ...base([]),
      "GET /api/suggestions?q=zwi": () => ({ status: 200, body: [{ name: "Zwiebeln", category: "Obst & Gemüse" }] }),
      "POST /api/lists/l1/items": (b) => ({ status: 200, body: { ...milk, id: "i2", name: (b as { name: string }).name, category: "Obst & Gemüse" } }),
    });
    renderAt("/einkauf");
    const input = await screen.findByLabelText(de.shopping.add);
    fireEvent.change(input, { target: { value: "zwi" } });
    expect(await screen.findByRole("option", { name: /Zwiebeln/ })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/lists/l1/items" && (c.body as { name: string }).name === "Zwiebeln")).toBe(true));
  });

  it("checked item moves to checked section", async () => {
    let items = [milk];
    fakeApi({
      ...base(),
      "GET /api/lists/l1/items": () => ({ status: 200, body: items }),
      "PATCH /api/items/i1": () => {
        items = [{ ...milk, checkedAt: "2026-11-26T10:00:00Z", checkedBy: "a1" }];
        return { status: 200, body: items[0] };
      },
    });
    renderAt("/einkauf");
    fireEvent.click(await screen.findByRole("checkbox", { name: de.shopping.check("Milch") }));
    const section = await screen.findByRole("region", { name: de.shopping.checked });
    expect(within(section).getByText("Milch")).toBeInTheDocument();
    expect(within(section).getByText(de.shopping.checkedBy("Alex"))).toBeInTheDocument();
  });

  it("visibility sheet keeps self selected", async () => {
    fakeApi(base());
    renderAt("/einkauf");
    fireEvent.click(await screen.findByRole("button", { name: de.visibility.see(de.visibility.all) }));
    fireEvent.click(await screen.findByLabelText(new RegExp(de.visibility.some)));
    const self = screen.getByRole("checkbox", { name: /Alex/ });
    expect(self).toBeChecked();
    expect(self).toBeDisabled();
  });

  it("unseen items of others are highlighted", async () => {
    fakeApi({ ...base(), "GET /api/board": () => ({ status: 200, body: [{ kind: "shopping", who: "s1", whoName: "Sam", listId: "l1", listName: "Einkauf", count: 1, latestAt: milk.addedAt, itemIds: ["i1"] }] }) });
    renderAt("/einkauf");
    const name = await screen.findByText("Milch");
    await waitFor(() => expect(name.closest(".item")).toHaveClass("is-new"));
  });
});

describe("home board", () => {
  it("lists what others added and links to the list", async () => {
    fakeApi({ ...base(), "GET /api/board": () => ({ status: 200, body: [{ kind: "shopping", who: "s1", whoName: "Sam", listId: "l1", listName: "Einkauf", count: 3, latestAt: "2026-11-26T09:12:00Z", itemIds: ["a", "b", "c"] }] }) });
    renderAt("/");
    const link = await screen.findByRole("link", { name: new RegExp(de.board.added("Sam", 3, "Einkauf")) });
    expect(link).toHaveAttribute("href", "/einkauf?liste=l1");
  });
});

describe("shopping review fixes", () => {
  it("a new list asks who may see it before it is created", async () => {
    const calls = fakeApi({
      ...base(),
      "POST /api/lists": (b) => ({ status: 200, body: { ...list, id: "l2", name: (b as { name: string }).name, visibility: (b as { visibility: unknown }).visibility } }),
    });
    renderAt("/einkauf");
    fireEvent.click(await screen.findByRole("button", { name: de.shopping.manage }));
    fireEvent.click(await screen.findByRole("button", { name: de.shopping.newList }));
    fireEvent.change(await screen.findByLabelText(de.shopping.listName), { target: { value: "Geschenke" } });
    fireEvent.click(screen.getByRole("button", { name: de.members.save }));
    fireEvent.click(await screen.findByLabelText(new RegExp(de.visibility.me)));
    fireEvent.click(screen.getByRole("button", { name: de.members.save }));
    await waitFor(() => {
      const post = calls.find((c) => c.key === "POST /api/lists");
      expect(post?.body).toEqual({ name: "Geschenke", visibility: { everyone: false, memberIds: ["a1"] } });
    });
  });

  it("a list can be emptied after asking", async () => {
    const calls = fakeApi({ ...base(), "DELETE /api/lists/l1/items": () => ({ status: 200, body: { removed: 1 } }) });
    renderAt("/einkauf");
    fireEvent.click(await screen.findByRole("button", { name: de.shopping.manage }));
    fireEvent.click(await screen.findByRole("button", { name: de.shopping.clearList }));
    expect(calls.some((c) => c.key === "DELETE /api/lists/l1/items")).toBe(false);
    fireEvent.click(within(await screen.findByRole("dialog", { name: de.shopping.clearListConfirm("Einkauf") })).getByRole("button", { name: de.shopping.clearList }));
    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /api/lists/l1/items")).toBe(true));
  });

  it("editing sends only the changed fields", async () => {
    const long = { ...milk, quantity: "1 l + 2 Pck + 500 g + 1 Dose + 3 Fl" };
    const calls = fakeApi({ ...base([long]), "PATCH /api/items/i1": () => ({ status: 200, body: long }) });
    renderAt("/einkauf");
    fireEvent.click(await screen.findByRole("button", { name: /Milch/ }));
    fireEvent.change(await screen.findByLabelText(de.shopping.category), { target: { value: "Getränke" } });
    fireEvent.click(screen.getByRole("button", { name: de.members.save }));
    await waitFor(() => expect(calls.find((c) => c.key === "PATCH /api/items/i1")?.body).toEqual({ category: "Getränke" }));
  });
});

describe("shopping layout", () => {
  it("every row keeps the amount column, so the tick boxes line up", async () => {
    const rucola: ItemDto = { ...milk, id: "i3", name: "Rucola", quantity: "", category: "Obst & Gemüse" };
    fakeApi(base([milk, rucola]));
    renderAt("/einkauf");
    await screen.findByText("Rucola");
    const rows = document.querySelectorAll(".item");
    expect([...rows].map((r) => r.children.length)).toEqual([3, 3]);
  });
});
