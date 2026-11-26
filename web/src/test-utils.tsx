import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { routes } from "./routes.tsx";

type Handler = (body: unknown) => { status: number; body: unknown };
export type FakeApi = Record<string, Handler>;

/** Replace fetch with a table of "METHOD /path" handlers. */
export function fakeApi(table: FakeApi) {
  const calls: { key: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = (init?.method ?? "GET") + " " + url;
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ key, body });
      const h = table[key] ?? table[key.split("?")[0] + "?*"];
      if (!h) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
      const r = h(body);
      return new Response(JSON.stringify(r.body), { status: r.status });
    }),
  );
  return calls;
}

export function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

export const alex = { id: "a1", username: "alex", displayName: "Alex", role: "admin", color: "person-mint" };
export const sam = { id: "s1", username: "sam", displayName: "Sam", role: "member", color: "person-lilac" };
