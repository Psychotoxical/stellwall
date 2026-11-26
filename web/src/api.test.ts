import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api.ts";

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("api sends X-Stellwall header", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api("/api/auth/logout", { method: "POST" });
    const init = fetchMock.mock.calls[0]![1];
    expect(new Headers(init.headers).get("x-stellwall")).toBe("1");
    expect(init.credentials).toBe("same-origin");
  });

  it("api throws ApiError with status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "locked", until: "x" }), { status: 429 })));
    const err = await api("/api/auth/login", { method: "POST", body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).code).toBe("locked");
    expect((err as ApiError).data).toMatchObject({ until: "x" });
  });

  it("api throws a network ApiError when offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const err = (await api("/api/me").catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(0);
    expect(err.code).toBe("network");
  });
});
