import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { alex, fakeApi, renderAt } from "../test-utils.tsx";
import { de } from "../text/de.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-world");
});

const me = { ...alex, world: "salbei" };
const base = {
  "GET /api/me": () => ({ status: 200, body: me }),
  "GET /api/members": () => ({ status: 200, body: [me] }),
  "GET /api/me/sessions": () => ({ status: 200, body: [] }),
  "GET /api/board": () => ({ status: 200, body: [] }),
  "GET /api/todos?*": () => ({ status: 200, body: [] }),
  "GET /api/calendar?*": () => ({ status: 200, body: [] }),
  "GET /api/meals?*": () => ({ status: 200, body: [] }),
};

describe("colour world", () => {
  it("the app takes on the person's world", async () => {
    fakeApi(base);
    renderAt("/");
    await screen.findByRole("heading", { name: de.home.hello("Alex") });
    expect(document.documentElement.dataset.world).toBe("salbei");
  });

  it("a person picks another world in their account", async () => {
    const calls = fakeApi({ ...base, "PATCH /api/members/a1": (b) => ({ status: 200, body: { ...me, ...(b as object) } }) });
    renderAt("/konto");
    fireEvent.click(await screen.findByRole("radio", { name: de.account.worlds.rose }));
    await waitFor(() => expect(calls.find((c) => c.key === "PATCH /api/members/a1")?.body).toEqual({ world: "rose" }));
    await waitFor(() => expect(document.documentElement.dataset.world).toBe("rose"));
  });

  it("the start page shows the name as a wordmark", async () => {
    fakeApi(base);
    renderAt("/");
    expect(await screen.findAllByRole("img", { name: "Stellwall" })).not.toHaveLength(0);
  });
});
