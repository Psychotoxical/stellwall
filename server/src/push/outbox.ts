import { and, eq, inArray, isNull, like, lt, lte } from "drizzle-orm";
import webpush from "web-push";
import { bundleDue, quietUntil } from "@stellwall/shared";
import type { Db } from "../db/client.ts";
import { birthdays, events, lists, members, notificationPrefs, notifications, pushSubscriptions, settings, todos } from "../db/schema.ts";
import { eventVisibleTo } from "../calendar/events.ts";
import { birthdayVisibleTo } from "../calendar/birthdays.ts";
import { listVisibleTo } from "../shopping/visibility.ts";
import { todoVisibleTo } from "../todos/routes.ts";

export const KINDS = ["event", "event_reminder", "todo", "todo_reminder", "shopping", "birthday", "meal"] as const;
export type Kind = (typeof KINDS)[number];
export type Ref = { type: "event" | "list" | "todo" | "birthday" | "meal" | "test"; id: string };
export type PushSender = (sub: { endpoint: string; p256dh: string; auth: string }, payload: string) => Promise<{ gone: boolean }>;

type Entry = {
  memberIds: string[];
  /** Who caused it; never told about their own change. */
  actor: string | null;
  kind: Kind;
  ref: Ref;
  title: string;
  body: string;
  url: string;
  dueAt?: Date;
  /** The same key is only ever queued once per person (reminders). */
  dedupe?: string;
  /** Hold until morning when due at night (default); reminders pass false. */
  quiet?: boolean;
};

const BATCH = 200;

/** The server's own push key pair, made once on first use; the private half never leaves the server. */
export async function vapidKeys(db: Db): Promise<{ publicKey: string; privateKey: string }> {
  const read = async () => {
    const rows = await db.select().from(settings).where(inArray(settings.key, ["vapid_public", "vapid_private"]));
    const publicKey = rows.find((r) => r.key === "vapid_public")?.value;
    const privateKey = rows.find((r) => r.key === "vapid_private")?.value;
    return publicKey && privateKey ? { publicKey, privateKey } : null;
  };
  const have = await read();
  if (have) return have;
  const keys = webpush.generateVAPIDKeys();
  await db
    .insert(settings)
    .values([{ key: "vapid_public", value: keys.publicKey, updatedAt: new Date() }, { key: "vapid_private", value: keys.privateKey, updatedAt: new Date() }])
    .onConflictDoNothing();
  return (await read())!;
}

/** Sends through the browsers' push services with the server's key. */
export function webPushSender(db: Db, publicUrl: string): PushSender {
  let ready: Promise<void> | null = null;
  return async (sub, payload) => {
    // A failed setup (database away) is tried again with the next message instead of stopping all pushes.
    ready ??= vapidKeys(db)
      .then((k) => webpush.setVapidDetails(publicUrl, k.publicKey, k.privateKey))
      .catch((e: unknown) => {
        ready = null;
        throw e;
      });
    await ready;
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 24 * 3600, timeout: 10_000 });
      return { gone: false };
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      return { gone: code === 404 || code === 410 };
    }
  };
}

export function createOutbox(db: Db, opts: { now: () => Date; timeZone: string; sender: PushSender }) {
  const { now, timeZone: tz, sender } = opts;

  async function wanted(memberIds: string[], actor: string | null, kind: Kind) {
    let ids = [...new Set(memberIds)].filter((id) => id !== actor);
    if (!ids.length) return [];
    // Removed members are told nothing more.
    const active = await db.select({ id: members.id }).from(members).where(and(inArray(members.id, ids), isNull(members.removedAt)));
    ids = ids.filter((id) => active.some((a) => a.id === id));
    if (!ids.length) return [];
    const off = await db.select({ id: notificationPrefs.memberId }).from(notificationPrefs).where(and(inArray(notificationPrefs.memberId, ids), eq(notificationPrefs.kind, kind), eq(notificationPrefs.enabled, false)));
    return ids.filter((id) => !off.some((o) => o.id === id));
  }

  const holdForNight = (at: Date, quiet: boolean) => (quiet ? (quietUntil(at, tz) ?? at) : at);

  async function stillVisible(memberId: string, ref: Ref): Promise<boolean> {
    const one = async (q: Promise<unknown[]>) => (await q).length > 0;
    switch (ref.type) {
      case "event":
        return one(db.select({ id: events.id }).from(events).where(and(eq(events.id, ref.id), eventVisibleTo(memberId))).limit(1));
      case "list":
        return one(db.select({ id: lists.id }).from(lists).where(and(eq(lists.id, ref.id), listVisibleTo(memberId))).limit(1));
      case "todo":
        return one(db.select({ id: todos.id }).from(todos).where(and(eq(todos.id, ref.id), todoVisibleTo(memberId))).limit(1));
      case "birthday":
        return one(db.select({ id: birthdays.id }).from(birthdays).where(and(eq(birthdays.id, ref.id), birthdayVisibleTo(memberId))).limit(1));
      default:
        return true;
    }
  }

  return {
    async enqueue(e: Entry) {
      const ids = await wanted(e.memberIds, e.actor, e.kind);
      if (!ids.length) return;
      const dueAt = holdForNight(e.dueAt ?? now(), e.quiet ?? true);
      await db
        .insert(notifications)
        .values(ids.map((memberId) => ({ memberId, kind: e.kind, refType: e.ref.type, refId: e.ref.id, title: e.title, body: e.body, url: e.url, dueAt, dedupe: e.dedupe ?? null })))
        .onConflictDoNothing();
    },

    /** Shopping: one waiting message per person and key; each change counts it up and moves it five minutes on. */
    async bundle(b: { memberIds: string[]; actor: string | null; ref: Ref; key: string; text: (count: number) => string; url: string; title?: string }) {
      const ids = await wanted(b.memberIds, b.actor, "shopping");
      const at = now();
      for (const memberId of ids) {
        const open = (await db.select().from(notifications).where(and(eq(notifications.memberId, memberId), isNull(notifications.sentAt), like(notifications.dedupe, `bundle:${b.key}:%`))).limit(1))[0];
        const dueAt = holdForNight(bundleDue(at), true);
        if (open) {
          await db.update(notifications).set({ count: open.count + 1, body: b.text(open.count + 1), dueAt }).where(eq(notifications.id, open.id));
        } else {
          await db.insert(notifications).values({ memberId, kind: "shopping", refType: b.ref.type, refId: b.ref.id, title: b.title ?? "Einkauf", body: b.text(1), url: b.url, dueAt, dedupe: `bundle:${b.key}:${at.getTime()}` });
        }
      }
    },

    /** Sends what is due, after checking again that the person may still see it and still wants it. */
    async dispatch() {
      // Claim the batch in one step, so that a second run at the same time never sends the same message.
      const t = now();
      const due = await db
        .update(notifications)
        .set({ sentAt: t })
        .where(and(isNull(notifications.sentAt), inArray(notifications.id, db.select({ id: notifications.id }).from(notifications).where(and(isNull(notifications.sentAt), lte(notifications.dueAt, t))).limit(BATCH))))
        .returning();
      for (const n of due) {
        if (!(await wanted([n.memberId], null, n.kind as Kind)).length) continue;
        if (!(await stillVisible(n.memberId, { type: n.refType as Ref["type"], id: n.refId }))) continue;
        const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.memberId, n.memberId));
        const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url });
        for (const s of subs) {
          const r = await sender(s, payload).catch(() => ({ gone: false }));
          if (r.gone) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        }
      }
    },

    /** Sent messages older than a month are no longer needed. */
    async prune() {
      await db.delete(notifications).where(lt(notifications.sentAt, new Date(now().getTime() - 30 * 86_400_000)));
    },
  };
}
export type Outbox = ReturnType<typeof createOutbox>;
