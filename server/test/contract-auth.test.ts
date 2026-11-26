import { describe, it } from "vitest";
import { createTestApp } from "./helpers.ts";
import { H, login, setupAdmin } from "./auth-helpers.ts";
import { contract } from "./contract.ts";

const clock = (iso: string) => () => new Date(iso);

describe("contract: sign-in", () => {
  it("writes the sign-in examples the apps parse", async () => {
    const { app } = await createTestApp({ now: clock("2026-11-26T10:00:00Z") });
    const { cookie } = await setupAdmin(app, "alex", "correct-horse-1");
    contract("login-ok", await login(app, "alex", "correct-horse-1"));
    contract("me", await app.inject({ method: "GET", url: "/api/me", headers: { cookie } }));
    contract("me-signed-out", await app.inject({ method: "GET", url: "/api/me" }));
    contract("login-invalid", await login(app, "alex", "wrong-password"));
    for (let i = 0; i < 5; i++) await login(app, "alex", `wrong-${i}-pass`);
    contract("login-locked", await login(app, "alex", "wrong-6-pass"));
    contract("logout", await app.inject({ method: "POST", url: "/api/auth/logout", headers: { ...H, cookie }, payload: {} }));
  });
});
