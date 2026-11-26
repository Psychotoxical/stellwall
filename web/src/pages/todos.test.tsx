import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { alex, fakeApi, renderAt, sam } from "../test-utils.tsx";
import { de } from "../text/de.ts";

afterEach(() => vi.unstubAllGlobals());

const occ = (o: Partial<Record<string, unknown>>) => ({
  todoId: "t1", title: "Müll rausbringen", date: "2026-11-24", at: "2026-11-23T23:00:00.000Z", overdue: false, done: null,
  assignees: [], needsConfirm: false, everyone: true, createdBy: "a1", ...o,
});

function base(today: unknown[] = []) {
  return {
    "GET /api/me": () => ({ status: 200, body: alex }),
    "GET /api/members": () => ({ status: 200, body: [alex, sam] }),
    "GET /api/board": () => ({ status: 200, body: [] }),
    "GET /api/todos?view=today&mine=1": () => ({ status: 200, body: today }),
    "GET /api/todos?view=today": () => ({ status: 200, body: today }),
  };
}

describe("to-dos page", () => {
  it("confirm off hides the check box", async () => {
    fakeApi(base([occ({ todoId: "a", title: "Müll rausbringen" }), occ({ todoId: "b", title: "Katzenklo sauber machen", needsConfirm: true })]));
    renderAt("/todos");
    expect(await screen.findByText("Müll rausbringen")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: de.todos.check("Müll rausbringen") })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: de.todos.check("Katzenklo sauber machen") })).toBeInTheDocument();
  });

  it("overdue shows first and is marked", async () => {
    fakeApi(base([occ({ todoId: "b", title: "Bad putzen", date: "2026-11-23", overdue: true, needsConfirm: true }), occ({ todoId: "a", title: "Müll rausbringen" })]));
    renderAt("/todos");
    const rows = await screen.findAllByRole("listitem");
    expect(within(rows[0]!).getByText("Bad putzen")).toBeInTheDocument();
    expect(within(rows[0]!).getByText(de.todos.overdue)).toBeInTheDocument();
  });

  it("weekday picker builds weekly rule", async () => {
    const calls = fakeApi({ ...base(), "POST /api/todos": (b) => ({ status: 200, body: { id: "n1", ...(b as object) } }) });
    renderAt("/todos");
    fireEvent.click(await screen.findByRole("button", { name: de.todos.new }));
    fireEvent.change(await screen.findByLabelText(de.todos.title), { target: { value: "Müll rausbringen" } });
    fireEvent.change(screen.getByLabelText(de.todos.date), { target: { value: "2026-11-24" } });
    fireEvent.change(screen.getByLabelText(de.todos.repeat), { target: { value: "weekly" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Di" }));
    fireEvent.click(screen.getByRole("button", { name: de.members.save }));
    await waitFor(() => {
      const post = calls.find((c) => c.key === "POST /api/todos");
      expect(post?.body).toMatchObject({ title: "Müll rausbringen", startDate: "2026-11-24", recurrence: { kind: "weekly", weekdays: [2] }, needsConfirm: false });
    });
  });

  it("checking posts the occurrence date", async () => {
    const calls = fakeApi({ ...base([occ({ needsConfirm: true })]), "POST /api/todos/t1/done": () => ({ status: 200, body: { by: "a1", at: "x" } }) });
    renderAt("/todos");
    fireEvent.click(await screen.findByRole("checkbox", { name: de.todos.check("Müll rausbringen") }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/todos/t1/done")?.body).toEqual({ date: "2026-11-24" }));
  });
});

describe("to-dos review fixes", () => {
  it("an undated to-do can always be checked off", async () => {
    fakeApi({ ...base(), "GET /api/todos?view=undated&mine=1": () => ({ status: 200, body: [occ({ title: "Zimmer aufräumen", date: null, at: null })] }) });
    renderAt("/todos");
    fireEvent.click(await screen.findByRole("button", { name: de.todos.views.undated }));
    expect(await screen.findByRole("checkbox", { name: de.todos.check("Zimmer aufräumen") })).toBeInTheDocument();
  });
});
