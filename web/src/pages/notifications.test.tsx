import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { alex, fakeApi, renderAt } from "../test-utils.tsx";
import { de } from "../text/de.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const prefs = { event: true, event_reminder: true, todo: true, todo_reminder: true, shopping: true, birthday: true, meal: true };
const base = (more: Record<string, (b: unknown) => { status: number; body: unknown }> = {}) => ({
  "GET /api/me": () => ({ status: 200, body: alex }),
  "GET /api/members": () => ({ status: 200, body: [alex] }),
  "GET /api/notification-prefs": () => ({ status: 200, body: prefs }),
  "GET /api/push/subscriptions": () => ({ status: 200, body: [] }),
  ...more,
});

describe("notification settings", () => {
  it("switches start on and save when changed", async () => {
    const calls = fakeApi(base({ "PUT /api/notification-prefs": () => ({ status: 200, body: { ok: true } }) }));
    renderAt("/benachrichtigungen");
    const shopping = await screen.findByRole("checkbox", { name: new RegExp(de.notify.kinds.shopping!) });
    expect(shopping).toBeChecked();
    fireEvent.click(shopping);
    await waitFor(() => expect(calls.find((c) => c.key === "PUT /api/notification-prefs")?.body).toEqual({ shopping: false }));
  });

  it("on an iPhone outside the home screen it explains the way there first", async () => {
    const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15");
    onTestFinished(() => ua.mockRestore());
    fakeApi(base());
    renderAt("/benachrichtigungen");
    expect(await screen.findByText(de.notify.iphoneTitle)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: de.notify.allow })).not.toBeInTheDocument();
  });

  it("explains how to undo a refused permission", async () => {
    vi.stubGlobal("Notification", Object.assign(function () {}, { permission: "denied", requestPermission: async () => "denied" }));
    fakeApi(base());
    renderAt("/benachrichtigungen");
    expect(await screen.findByText(de.notify.denied)).toBeInTheDocument();
  });
});

describe("cooking", () => {
  const recipe = { id: "11111111-1111-4111-8111-111111111111", slug: "gemuese-pfanne", name: "Gemüsepfanne", servings: 4, hasImage: false, steps: ["Reis kochen.", "Gemüse anbraten."], ingredients: [{ quantity: 200, unit: "g", food: "Reis", note: "" }] };
  const api = base({ "GET /api/recipes/gemuese-pfanne": () => ({ status: 200, body: recipe }) });

  it("tapping an ingredient or step crosses it out, tapping again brings it back, and it stays after a reload", async () => {
    fakeApi(api);
    renderAt("/essen/rezept/gemuese-pfanne?portionen=4&tag=2026-11-27");
    const rice = await screen.findByRole("button", { name: /Reis$/ });
    fireEvent.click(rice);
    expect(rice).toHaveAttribute("aria-pressed", "true");
    const step = screen.getByRole("button", { name: "Reis kochen." });
    fireEvent.click(step);
    fireEvent.click(step);
    expect(step).toHaveAttribute("aria-pressed", "false");
    cleanup();
    renderAt("/essen/rezept/gemuese-pfanne?portionen=4&tag=2026-11-27");
    expect(await screen.findByRole("button", { name: /Reis$/ })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("notification review fixes", () => {
  const endpoint = "https://fcm.googleapis.com/fcm/send/this-device";
  function fakePush() {
    const sub = { endpoint, toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }), unsubscribe: async () => true };
    const reg = { pushManager: { getSubscription: async () => sub } };
    Object.defineProperty(navigator, "serviceWorker", { value: { getRegistration: async () => reg, ready: Promise.resolve(reg) }, configurable: true });
    vi.stubGlobal("PushManager", function () {});
    vi.stubGlobal("Notification", Object.assign(function () {}, { permission: "granted", requestPermission: async () => "granted" }));
    onTestFinished(() => {
      delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    });
  }

  it("a device that already receives messages is registered for whoever is signed in now", async () => {
    fakePush();
    const calls = fakeApi(base({ "POST /api/push/subscriptions": () => ({ status: 200, body: { id: "d1" } }) }));
    renderAt("/benachrichtigungen");
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/push/subscriptions")?.body).toMatchObject({ endpoint }));
  });

  it("signing out takes the device's push address along", async () => {
    fakePush();
    const calls = fakeApi(base({ "GET /api/auth/sessions": () => ({ status: 200, body: [] }), "POST /api/auth/logout": () => ({ status: 200, body: { ok: true } }) }));
    renderAt("/konto");
    fireEvent.click(await screen.findByRole("button", { name: de.account.logout }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/auth/logout")?.body).toEqual({ pushEndpoint: endpoint }));
  });

  it("an iPad, which calls itself a Mac, also gets the home-screen steps", async () => {
    const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15");
    Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
    onTestFinished(() => {
      ua.mockRestore();
      delete (navigator as unknown as Record<string, unknown>).maxTouchPoints;
    });
    fakeApi(base());
    renderAt("/benachrichtigungen");
    expect(await screen.findByText(de.notify.iphoneTitle)).toBeInTheDocument();
  });
});
