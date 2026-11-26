import { randomUUID } from "node:crypto";
import { lookup as dnsLookup } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import type { LookupFunction } from "node:net";
import type { FastifyInstance } from "fastify";
import ICAL from "ical.js";
import { z } from "zod";
import { expandEvent, localDate, validRule, zonedTime } from "@stellwall/shared";
import type { Db } from "../db/client.ts";
import { eventExceptions, eventFor, eventMembers, events } from "../db/schema.ts";
import { requireMember } from "../auth/guard.ts";
import type { Notifier } from "../shopping/notify.ts";

const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const TOKEN_TTL_MS = 15 * 60_000;
const DAY = 86_400_000;

// ---------- network safety ----------

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96]] as const) blocked.addSubnet(net, prefix, "ipv6");

/** True for addresses in the own machine, private networks and other non-public ranges. */
export function isBlockedAddress(addr: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr);
  if (mapped) return isBlockedAddress(mapped[1]!);
  const v = isIP(addr);
  if (v === 4) return blocked.check(addr, "ipv4");
  if (v === 6) return blocked.check(addr, "ipv6");
  return true;
}

const safeLookup: LookupFunction = (hostname, options, cb) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err, "", 0);
    const list = addrs as { address: string; family: number }[];
    if (!list.length || list.some((a) => isBlockedAddress(a.address))) return cb(new Error("blocked_address"), "", 0);
    if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: typeof list) => void)(null, list);
    cb(null, list[0]!.address, list[0]!.family);
  });
};

class ImportError extends Error {}

function checkUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim().replace(/^webcal:/i, "https:"));
  } catch {
    throw new ImportError("bad_url");
  }
  if (u.protocol !== "https:" || u.username || u.password) throw new ImportError("bad_url");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isBlockedAddress(host)) throw new ImportError("bad_url");
  if (host === "localhost" || host.endsWith(".localhost")) throw new ImportError("bad_url");
  return u;
}

function fetchText(url: URL, redirects = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(url, { lookup: safeLookup, timeout: FETCH_TIMEOUT_MS, headers: { accept: "text/calendar, */*" } }, (res) => {
      const code = res.statusCode ?? 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        if (!redirects) return reject(new ImportError("fetch_failed"));
        try {
          return resolve(fetchText(checkUrl(new URL(res.headers.location, url).toString()), redirects - 1));
        } catch (e) {
          return reject(e);
        }
      }
      if (code !== 200) {
        res.resume();
        return reject(new ImportError("fetch_failed"));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) {
          req.destroy();
          reject(new ImportError("too_big"));
        } else chunks.push(c);
      });
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", () => reject(new ImportError("fetch_failed")));
    });
    const timer = setTimeout(() => req.destroy(new Error("timeout")), FETCH_TIMEOUT_MS);
    req.on("close", () => clearTimeout(timer));
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => reject(e instanceof ImportError ? e : new ImportError("fetch_failed")));
    req.end();
  });
}

// ---------- parsing ----------

export type ParsedException = { date: string; cancelled: boolean; title: string | null; location: string | null; startAt: Date | null; endAt: Date | null };
export type ParsedEvent = {
  uid: string;
  title: string;
  location: string;
  notes: string;
  allDay: boolean;
  startAt: Date;
  endAt: Date;
  tz: string;
  rrule: string | null;
  exceptions: ParsedException[];
};

const isZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
const pad = (n: number) => String(n).padStart(2, "0");
const dateOf = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;
const addDays = (d: string, n: number) => new Date(new Date(d + "T00:00:00Z").getTime() + n * DAY).toISOString().slice(0, 10);

/** The absolute moment of an iCalendar time, honouring UTC, IANA zones, embedded zones, else the app zone. */
function instant(t: ICAL.Time, tzid: string | null, appTz: string, registered: Set<string>): Date {
  if (t.zone?.tzid === "UTC" || t.zone === ICAL.Timezone.utcTimezone) return t.toJSDate();
  if (tzid && isZone(tzid)) return zonedTime(dateOf(t), `${pad(t.hour)}:${pad(t.minute)}`, tzid);
  if (tzid && registered.has(tzid)) return t.toJSDate();
  return zonedTime(dateOf(t), `${pad(t.hour)}:${pad(t.minute)}`, appTz);
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "");

/** Parses an iCalendar text into events. Throws ImportError("bad_file") on anything it cannot read. */
export function parseIcs(text: string, appTz: string): ParsedEvent[] {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new ImportError("bad_file");
  }
  if (root.name !== "vcalendar") throw new ImportError("bad_file");
  const registered = new Set<string>();
  for (const z of root.getAllSubcomponents("vtimezone")) {
    try {
      const tz = new ICAL.Timezone(z);
      ICAL.TimezoneService.register(tz);
      registered.add(tz.tzid);
    } catch {
      /* unreadable zone: times fall back to the app zone */
    }
  }
  const masters = new Map<string, ParsedEvent>();
  const overrides: { uid: string; comp: ICAL.Component }[] = [];
  try {
    for (const comp of root.getAllSubcomponents("vevent")) {
      const uidRaw = comp.getFirstPropertyValue("uid");
      if (comp.hasProperty("recurrence-id")) {
        if (typeof uidRaw === "string") overrides.push({ uid: uidRaw, comp });
        continue;
      }
      const startProp = comp.getFirstProperty("dtstart");
      if (!startProp) throw new ImportError("bad_file");
      const start = startProp.getFirstValue() as ICAL.Time;
      if (!(start instanceof ICAL.Time)) throw new ImportError("bad_file");
      const tzid = (startProp.getParameter("tzid") as string | undefined) ?? null;
      const tz = tzid && isZone(tzid) ? tzid : appTz;
      const ev = new ICAL.Event(comp);
      const allDay = start.isDate;
      let startAt: Date;
      let endAt: Date;
      if (allDay) {
        const sd = dateOf(start);
        let ed = comp.hasProperty("dtend") || comp.hasProperty("duration") ? dateOf(ev.endDate) : addDays(sd, 1);
        if (ed <= sd) ed = addDays(sd, 1);
        startAt = zonedTime(sd, "00:00", tz);
        endAt = zonedTime(ed, "00:00", tz);
      } else {
        startAt = instant(start, tzid, appTz, registered);
        const endProp = comp.getFirstProperty("dtend");
        endAt = endProp
          ? instant(endProp.getFirstValue() as ICAL.Time, (endProp.getParameter("tzid") as string | undefined) ?? tzid, appTz, registered)
          : comp.hasProperty("duration")
            ? new Date(startAt.getTime() + (comp.getFirstPropertyValue("duration") as ICAL.Duration).toSeconds() * 1000)
            : startAt;
        if (!(endAt > startAt)) endAt = new Date(startAt.getTime() + 60 * 60_000);
      }
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) throw new ImportError("bad_file");
      const recur = comp.getFirstPropertyValue("rrule") as ICAL.Recur | null;
      let rrule = recur ? recur.toString() : null;
      if (rrule && !validRule(rrule)) rrule = null;
      if (recur && !rrule) continue; // a rule we cannot repeat correctly: leave it out rather than import it wrong
      const exceptions: ParsedException[] = [];
      for (const ex of comp.getAllProperties("exdate")) {
        for (const v of ex.getValues() as ICAL.Time[]) {
          const exTz = (ex.getParameter("tzid") as string | undefined) ?? tzid;
          const date = v.isDate ? dateOf(v) : localDate(instant(v, exTz, appTz, registered), tz);
          exceptions.push({ date, cancelled: true, title: null, location: null, startAt: null, endAt: null });
        }
      }
      const uid = typeof uidRaw === "string" && uidRaw.trim() ? uidRaw.trim().slice(0, 500) : `nouid-${startAt.toISOString()}-${clip(comp.getFirstPropertyValue("summary"), 120)}`;
      masters.set(uid, {
        uid,
        title: clip(comp.getFirstPropertyValue("summary"), 120) || "Termin",
        location: clip(comp.getFirstPropertyValue("location"), 200),
        notes: clip(comp.getFirstPropertyValue("description"), 2000),
        allDay,
        startAt,
        endAt,
        tz,
        rrule,
        exceptions,
      });
    }
    for (const { uid, comp } of overrides) {
      const master = masters.get(uid.trim().slice(0, 500));
      if (!master?.rrule) continue;
      const rid = comp.getFirstProperty("recurrence-id")!;
      const ridTime = rid.getFirstValue() as ICAL.Time;
      const date = ridTime.isDate ? dateOf(ridTime) : localDate(instant(ridTime, (rid.getParameter("tzid") as string | undefined) ?? null, appTz, registered), master.tz);
      const cancelled = String(comp.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";
      const sp = comp.getFirstProperty("dtstart");
      const ep = comp.getFirstProperty("dtend");
      const st = sp ? (sp.getFirstValue() as ICAL.Time) : null;
      const startAt = st && !st.isDate ? instant(st, (sp!.getParameter("tzid") as string | undefined) ?? null, appTz, registered) : null;
      const et = ep ? (ep.getFirstValue() as ICAL.Time) : null;
      const endAt = et && !et.isDate ? instant(et, (ep!.getParameter("tzid") as string | undefined) ?? null, appTz, registered) : startAt ? new Date(startAt.getTime() + (master.endAt.getTime() - master.startAt.getTime())) : null;
      const title = clip(comp.getFirstPropertyValue("summary"), 120);
      const location = clip(comp.getFirstPropertyValue("location"), 200);
      master.exceptions = master.exceptions.filter((x) => x.date !== date);
      master.exceptions.push({ date, cancelled, title: title && title !== master.title ? title : null, location: location && location !== master.location ? location : null, startAt, endAt });
    }
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError("bad_file");
  }
  return [...masters.values()];
}

/** Whether the event still has something on or after the given moment. */
function stillAhead(ev: ParsedEvent, from: Date): boolean {
  if (!ev.rrule) return ev.endAt > from;
  if (!/(^|;)(UNTIL|COUNT)=/i.test(ev.rrule)) return true;
  if (ev.startAt >= from) return true;
  const horizon = new Date(from.getTime() + 30 * 366 * DAY);
  return expandEvent({ start: ev.startAt, end: ev.endAt, allDay: ev.allDay, rrule: ev.rrule, tz: ev.tz }, [], from, horizon).length > 0;
}

// ---------- routes ----------

type Pending = { owner: string; events: ParsedEvent[]; expires: number };

const previewBody = z.union([z.object({ ics: z.string().min(1).max(MAX_BYTES) }), z.object({ url: z.string().min(1).max(2000) })]);
const commitBody = z.object({
  token: z.uuid(),
  from: z.enum(["today", "all"]),
  visibility: z.object({ everyone: z.boolean(), memberIds: z.array(z.uuid()).max(50) }),
});

export async function importRoutes(app: FastifyInstance, opts: { db: Db; now: () => Date; timeZone: string; notify: Notifier }) {
  const { db, now, timeZone: tz, notify } = opts;
  const pending = new Map<string, Pending>();
  const sweep = () => {
    const t = Date.now();
    for (const [k, v] of pending) if (v.expires < t) pending.delete(k);
  };
  const todayStart = () => zonedTime(localDate(now(), tz), "00:00", tz);

  app.post("/api/import/preview", { preHandler: requireMember, bodyLimit: MAX_BYTES * 2 }, async (req, reply) => {
    const b = previewBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    let parsed: ParsedEvent[];
    try {
      const text = "ics" in b.data ? b.data.ics : await fetchText(checkUrl(b.data.url));
      parsed = parseIcs(text, tz);
    } catch (e) {
      return reply.code(400).send({ error: e instanceof ImportError ? e.message : "bad_file" });
    }
    if (!parsed.length) return reply.code(400).send({ error: "no_events" });
    sweep();
    const token = randomUUID();
    pending.set(token, { owner: req.member!.id, events: parsed, expires: Date.now() + TOKEN_TTL_MS });
    const sorted = [...parsed].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    const today = todayStart();
    return {
      token,
      count: parsed.length,
      fromToday: parsed.filter((e) => stillAhead(e, today)).length,
      first: localDate(sorted[0]!.startAt, sorted[0]!.tz),
      last: localDate(sorted.at(-1)!.startAt, sorted.at(-1)!.tz),
      sample: sorted
        .filter((e) => stillAhead(e, today))
        .slice(0, 5)
        .map((e) => ({ title: e.title, date: localDate(e.startAt, e.tz), allDay: e.allDay, series: !!e.rrule })),
    };
  });

  app.post("/api/import/commit", { preHandler: requireMember }, async (req, reply) => {
    const b = commitBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "invalid_input" });
    const me = req.member!.id;
    sweep();
    const p = pending.get(b.data.token);
    if (!p || p.owner !== me) return reply.code(404).send({ error: "not_found" });
    pending.delete(b.data.token);
    const today = todayStart();
    const chosen = b.data.from === "today" ? p.events.filter((e) => stillAhead(e, today)) : p.events;
    const viewers = [...new Set([...b.data.visibility.memberIds, me])];
    let added = 0;
    await db.transaction(async (tx) => {
      for (const e of chosen) {
        const [row] = await tx
          .insert(events)
          .values({ title: e.title, location: e.location, notes: e.notes, startAt: e.startAt, endAt: e.endAt, allDay: e.allDay, tz: e.tz, rrule: e.rrule, everyone: b.data.visibility.everyone, createdBy: me, createdAt: now(), reminders: [], importUid: e.uid, importOwner: me })
          .onConflictDoNothing()
          .returning({ id: events.id });
        if (!row) continue;
        added++;
        await tx.insert(eventFor).values({ eventId: row.id, memberId: me, addedBy: me, addedAt: now() });
        await tx.insert(eventMembers).values(viewers.map((memberId) => ({ eventId: row.id, memberId })));
        if (e.exceptions.length)
          await tx.insert(eventExceptions).values(e.exceptions.map((x) => ({ eventId: row.id, occurrenceDate: x.date, cancelled: x.cancelled, title: x.title, location: x.location, startAt: x.startAt, endAt: x.endAt }))).onConflictDoNothing();
      }
    });
    if (added) notify.calendarGone(b.data.visibility.everyone ? null : viewers);
    return { added, skipped: chosen.length - added };
  });
}
