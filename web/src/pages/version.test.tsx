import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { alex, fakeApi, renderAt } from "../test-utils.tsx";
import { de } from "../text/de.ts";

afterEach(() => vi.unstubAllGlobals());

const base = {
  "GET /api/me": () => ({ status: 200, body: alex }),
  "GET /api/members": () => ({ status: 200, body: [alex] }),
  "GET /api/board": () => ({ status: 200, body: [] }),
  "GET /api/todos?*": () => ({ status: 200, body: [] }),
  "GET /api/calendar?*": () => ({ status: 200, body: [] }),
};

describe("version", () => {
  it("Mehr shows which version is running", async () => {
    fakeApi(base);
    renderAt("/mehr");
    expect(await screen.findByText(de.about.version(__APP_VERSION__))).toBeInTheDocument();
  });

  it("a waiting new version offers to reload", async () => {
    fakeApi(base);
    renderAt("/");
    await screen.findByRole("heading", { name: de.home.hello("Alex") });
    const reload = vi.fn();
    act(() => {
      window.dispatchEvent(new CustomEvent("stellwall:update", { detail: reload }));
    });
    fireEvent.click(await screen.findByRole("button", { name: de.update.reload }));
    expect(reload).toHaveBeenCalled();
  });
});
