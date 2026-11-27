import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PushSender } from "./outbox.ts";

/** The parts of a Firebase service account file the server needs. */
export type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri: string };

/** Phones register their FCM token as this endpoint, so they live beside the browsers' subscriptions. */
export const FCM_PREFIX = "fcm:";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export function readServiceAccount(file: string | null): ServiceAccount | null {
  if (!file) return null;
  const a = JSON.parse(readFileSync(file, "utf8")) as Partial<ServiceAccount>;
  if (!a.project_id || !a.client_email || !a.private_key) throw new Error("Firebase service account file is incomplete");
  return { project_id: a.project_id, client_email: a.client_email, private_key: a.private_key, token_uri: a.token_uri ?? "https://oauth2.googleapis.com/token" };
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

/**
 * Sends to Android phones through FCM (HTTP v1). The access token comes from a JWT signed with the
 * service account's key and is kept until a minute before it runs out.
 */
export function fcmSender(account: ServiceAccount, opts: { fetch?: typeof fetch; now?: () => Date } = {}): PushSender {
  const http = opts.fetch ?? fetch;
  const now = opts.now ?? (() => new Date());
  let token: { value: string; until: number } | null = null;

  async function accessToken(): Promise<string> {
    const t = now().getTime();
    if (token && t < token.until) return token.value;
    const iat = Math.floor(t / 1000);
    const head = b64({ alg: "RS256", typ: "JWT" });
    const claims = b64({ iss: account.client_email, scope: SCOPE, aud: account.token_uri, iat, exp: iat + 3600 });
    const sig = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(account.private_key, "base64url");
    const res = await http(account.token_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`FCM sign-in failed: ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, until: t + (body.expires_in - 60) * 1000 };
    return token.value;
  }

  return async (sub, payload) => {
    const data = Object.fromEntries(Object.entries(JSON.parse(payload) as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
    const res = await http(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await accessToken()}` },
      // Data only: the app builds the notification itself, with its channel and where a tap leads.
      body: JSON.stringify({ message: { token: sub.endpoint.slice(FCM_PREFIX.length), data, android: { priority: "HIGH", ttl: "86400s" } } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { gone: false };
    const err = (await res.json().catch(() => ({}))) as { error?: { status?: string; details?: { errorCode?: string }[] } };
    const code = err.error?.details?.find((d) => d.errorCode)?.errorCode;
    // The app was removed or the token replaced: the phone will never get it.
    return { gone: res.status === 404 || code === "UNREGISTERED" };
  };
}

/** Browsers through web push, phones through FCM; without FCM set up, phone messages are skipped. */
export function routedSender(web: PushSender, fcm: PushSender | null): PushSender {
  return async (sub, payload) => {
    if (!sub.endpoint.startsWith(FCM_PREFIX)) return web(sub, payload);
    return fcm ? fcm(sub, payload) : { gone: false };
  };
}
