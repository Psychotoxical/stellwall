export class ApiError extends Error {
  status: number;
  code: string;
  data: Record<string, unknown>;
  constructor(status: number, code: string, data: Record<string, unknown> = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

type Init = { method?: string; body?: unknown };

export async function api<T>(path: string, init: Init = {}): Promise<T> {
  const headers = new Headers({ "x-stellwall": "1" });
  if (init.body !== undefined) headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers,
      credentials: "same-origin",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    window.dispatchEvent(new Event("stellwall:network-error"));
    throw new ApiError(0, "network");
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new ApiError(res.status, typeof data.error === "string" ? data.error : "error", data);
  return data as T;
}
