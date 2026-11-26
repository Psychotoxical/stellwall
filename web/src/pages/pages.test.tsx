import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { alex, fakeApi, renderAt, sam } from "../test-utils.tsx";
import { de } from "../text/de.ts";

afterEach(() => vi.unstubAllGlobals());

const loggedOut = {
  "GET /api/me": () => ({ status: 401, body: { error: "unauthenticated" } }),
  "GET /api/setup/status": () => ({ status: 200, body: { needed: false } }),
};

describe("login", () => {
  it("login shows lock time on 429", async () => {
    const until = "2026-11-26T13:32:00.000Z";
    fakeApi({ ...loggedOut, "POST /api/auth/login": () => ({ status: 429, body: { error: "locked", until } }) });
    renderAt("/anmelden");
    fireEvent.change(await screen.findByLabelText(de.fields.username), { target: { value: "alex" } });
    fireEvent.change(screen.getByLabelText(de.fields.password), { target: { value: "whatever-123" } });
    fireEvent.click(screen.getByRole("button", { name: de.login.submit }));
    const time = new Date(until).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    expect(await screen.findByText(de.login.locked(time))).toBeInTheDocument();
  });

  it("sends logged-out visitors to login and first visitors to setup", async () => {
    fakeApi({ ...loggedOut, "GET /api/setup/status": () => ({ status: 200, body: { needed: true } }) });
    renderAt("/");
    expect(await screen.findByRole("heading", { name: de.setup.title })).toBeInTheDocument();
  });
});

describe("home", () => {
  it("shows the board and all six areas", async () => {
    fakeApi({ "GET /api/me": () => ({ status: 200, body: alex }) });
    renderAt("/");
    expect(await screen.findByRole("heading", { name: de.home.hello("Alex") })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: de.home.board })).toBeInTheDocument();
    for (const a of ["dokumente", "kalender", "geburtstage", "einkauf", "todos", "essensplan"] as const) {
      expect(screen.getAllByText(de.areas[a]).length).toBeGreaterThan(0);
    }
  });
});

describe("members", () => {
  it("members page hidden for non-admin", async () => {
    fakeApi({ "GET /api/me": () => ({ status: 200, body: sam }), "GET /api/members": () => ({ status: 200, body: [alex, sam] }) });
    renderAt("/mitglieder");
    expect(await screen.findByRole("heading", { name: de.home.hello("Sam") })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: de.members.title })).not.toBeInTheDocument();
  });

  it("remove dialog names the member", async () => {
    fakeApi({ "GET /api/me": () => ({ status: 200, body: alex }), "GET /api/members": () => ({ status: 200, body: [alex, sam] }) });
    renderAt("/mitglieder");
    await screen.findByText("Sam");
    fireEvent.click(screen.getByRole("button", { name: de.members.remove + " Sam" }));
    expect(await screen.findByRole("heading", { name: de.members.removeConfirm("Sam") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: de.members.removeAction("Sam") })).toBeInTheDocument();
  });

  it("shows the taken message when the username exists", async () => {
    fakeApi({
      "GET /api/me": () => ({ status: 200, body: alex }),
      "GET /api/members": () => ({ status: 200, body: [alex] }),
      "POST /api/members": () => ({ status: 409, body: { error: "username_taken" } }),
    });
    renderAt("/mitglieder");
    fireEvent.click(await screen.findByRole("button", { name: de.members.add }));
    fireEvent.change(screen.getByLabelText(de.fields.username), { target: { value: "sam" } });
    fireEvent.change(screen.getByLabelText(de.fields.displayName), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText(de.fields.password), { target: { value: "member-pass-1" } });
    fireEvent.click(screen.getByRole("button", { name: de.members.save }));
    expect(await screen.findByText(de.members.taken)).toBeInTheDocument();
  });
});
