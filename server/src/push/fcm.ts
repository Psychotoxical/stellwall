import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PushSender } from "./outbox.ts";

/** The parts of a Firebase service account file the server needs. */
export type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri: string };

/** Phones register their FCM token as this endpoint, so they live beside the browsers' subscriptions. */
export const FCM_PREFIX = "fcm:";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/**
 * Reads the service account file. A missing or broken file only switches phone messages off
 * (with a warning): the rest of Stellwall keeps running for the family.
 */
export function readServiceAccount(file: string | null, warn: (msg: string) => void = console.warn): ServiceAccount | null {
  if (!file) return null;
  try {
    const a = JSON.parse(readFileSync(file, "utf8")) as Partial<ServiceAccount>;
    if (!a.project_id || !a.client_email || !a.private_key) throw new Error("incomplete");
    return { project_id: a.project_id, client_email: a.client_email, private_key: a.private_key, token_uri: a.token_uri ?? "https://oauth2.googleapis.com/token" };
  } catch (e) {
    // Only the kind of error: a JSON message would quote part of the key into the log.
    const why = (e as { code?: string }).code === "ENOENT" ? "missing" : "unreadable or incomplete";
    warn(`Firebase service account ${file} is ${why}; Android phones get no notifications`);
    return null;
  }
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

/**
 * Sends to Android phones through FCM (HTTP v1). The access token comes from a JWT signed with the
 * service account's key and is kept until a minute before it runs out.
 */
export function fcmSender(account: ServiceAccount, opts: { fetch?: typeof fetch; now?: () => Date; warn?: (msg: string) => void } = {}): PushSender {
  const http = opts.fetch ?? fetch;
  const warn = opts.warn ?? console.warn;
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
      // Android gets data only and builds the notification itself, with its channel and where a tap leads.
      // iPhones only show what the message carries, so it has an alert for them; the data says where a tap leads.
      body: JSON.stringify({
        message: {
          token: sub.endpoint.slice(FCM_PREFIX.length),
          data,
          android: { priority: "HIGH", ttl: "86400s" },
          apns: { headers: { "apns-priority": "10" }, payload: { aps: { alert: { title: data.title ?? "", body: data.body ?? "" }, sound: "default", "thread-id": data.kind ?? "stellwall" } } },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { gone: false };
    // A refused access token is fetched anew with the next message.
    if (res.status === 401) token = null;
    const err = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } };
    const code = err.error?.details?.find((d) => d.errorCode)?.errorCode;
    // Without this a phone that never gets anything leaves no trace. The token stays out of the log.
    const phone = sub.endpoint.slice(FCM_PREFIX.length);
    const why = (err.error?.message ?? "").split(phone).join("<token>").slice(0, 200);
    warn(`FCM refused a message: ${res.status} ${err.error?.status ?? ""} ${code ?? ""} ${why}`.replace(/\s+/g, " ").trim());
    // Only this code means the app was removed or the token replaced. A plain 404 can also be a
    // wrong project in the service account, and that must not throw away every phone.
    // A 400 about the registration token is a token Google never issued; a 400 about anything
    // else is a fault in the message, and the phone stays.
    const badToken = res.status === 400 && code === "INVALID_ARGUMENT" && /registration token/i.test(err.error?.message ?? "");
    return { gone: code === "UNREGISTERED" || badToken };
  };
}

/** Browsers through web push, phones through FCM; without FCM set up, phone messages are skipped. */
export function routedSender(web: PushSender, fcm: PushSender | null): PushSender {
  return async (sub, payload) => {
    if (!sub.endpoint.startsWith(FCM_PREFIX)) return web(sub, payload);
    return fcm ? fcm(sub, payload) : { gone: false, skipped: true };
  };
}
