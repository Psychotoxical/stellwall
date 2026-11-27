import { describe, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { as, setupFamily } from "./family.ts";
import { contract } from "./contract.ts";

describe("contract: account and notifications", () => {
  it("writes the account and notification examples the apps parse", async () => {
    const { app } = await createTestApp({ now: () => new Date("2026-11-27T10:00:00Z") });
    const f = await setupFamily(app);
    const sam = as(app, f.sam.cookie);

    contract("member-updated", await sam.patch(`/api/members/${f.sam.id}`, { displayName: "Sammy", color: "person-sky", world: "rose" }));
    contract("member-forbidden", await sam.patch(`/api/members/${f.kim.id}`, { displayName: "Nope" }));
    contract("password-wrong", await sam.post("/api/me/password", { current: "wrong-password", next: "new-password-1" }));
    contract("password-too-short", await sam.post("/api/me/password", { current: "member-pass-1", next: "short" }));
    contract("password-changed", await sam.post("/api/me/password", { current: "member-pass-1", next: "new-password-1" }));
    contract("notification-prefs", await sam.get("/api/notification-prefs"));
    contract("notification-prefs-saved", await app.inject({ method: "PUT", url: "/api/notification-prefs", headers: { "x-stellwall": "1", cookie: f.sam.cookie }, payload: { shopping: false } }));
    await sam.post("/api/push/fcm", { token: "device-token-1-0123456789abcdef", label: "Galaxy" });
    contract("push-subscriptions", await sam.get("/api/push/subscriptions"));
    contract("push-test", await sam.post("/api/push/test"));
  });
});
