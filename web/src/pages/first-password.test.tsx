import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { fakeApi, renderAt, sam } from "../test-utils.tsx";
import { de } from "../text/de.ts";

afterEach(() => vi.unstubAllGlobals());

describe("first password", () => {
  it("a member with a password from the administration picks an own one first", async () => {
    const calls = fakeApi({
      "GET /api/me": () => ({ status: 200, body: { ...sam, mustChangePassword: true } }),
      "POST /api/me/password": () => ({ status: 200, body: { ok: true } }),
      "GET /api/members": () => ({ status: 200, body: [sam] }),
      "GET /api/board": () => ({ status: 200, body: [] }),
    });
    renderAt("/");
    expect(await screen.findByText(de.firstPassword.title("Sam"))).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    fireEvent.change(screen.getByLabelText(de.firstPassword.current), { target: { value: "member-pass-1" } });
    fireEvent.change(screen.getByLabelText(new RegExp(de.fields.newPassword)), { target: { value: "my-own-secret-9" } });
    fireEvent.click(screen.getByRole("button", { name: de.firstPassword.submit }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/me/password")?.body).toEqual({ current: "member-pass-1", next: "my-own-secret-9" }));
    await waitFor(() => expect(screen.queryByText(de.firstPassword.title("Sam"))).toBeNull());
  });

  it("right after signing in it does not ask for the old password again", async () => {
    const calls = fakeApi({
      "GET /api/me": () => ({ status: 401, body: { error: "unauthenticated" } }),
      "GET /api/setup/status": () => ({ status: 200, body: { needed: false } }),
      "POST /api/auth/login": () => ({ status: 200, body: { ...sam, mustChangePassword: true } }),
      "POST /api/me/password": () => ({ status: 200, body: { ok: true } }),
      "GET /api/members": () => ({ status: 200, body: [sam] }),
      "GET /api/board": () => ({ status: 200, body: [] }),
    });
    renderAt("/anmelden");
    fireEvent.change(await screen.findByLabelText(de.fields.username), { target: { value: "sam" } });
    fireEvent.change(screen.getByLabelText(de.fields.password), { target: { value: "member-pass-1" } });
    fireEvent.click(screen.getByRole("button", { name: de.login.submit }));
    expect(await screen.findByText(de.firstPassword.title("Sam"))).toBeTruthy();
    expect(screen.queryByLabelText(de.firstPassword.current)).toBeNull();
    fireEvent.change(screen.getByLabelText(new RegExp(de.fields.newPassword)), { target: { value: "my-own-secret-9" } });
    fireEvent.click(screen.getByRole("button", { name: de.firstPassword.submit }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/me/password")?.body).toEqual({ current: "member-pass-1", next: "my-own-secret-9" }));
  });

  it("asks for the old password as \"Altes Passwort\"", () => {
    expect(de.firstPassword.current).toBe("Altes Passwort");
    expect(de.firstPassword.wrong).toBe("Das alte Passwort stimmt nicht.");
  });

  it("the start page greets by the time of day", () => {
    expect([5, 11, 14, 18, 22, 4].map((h) => de.home.hello("Frank", h))).toEqual([
      "Guten Morgen, Frank", "Guten Mittag, Frank", "Guten Tag, Frank", "Guten Abend, Frank", "Gute Nacht, Frank", "Gute Nacht, Frank",
    ]);
  });
});
