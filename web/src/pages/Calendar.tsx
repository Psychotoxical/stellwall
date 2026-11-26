import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { MemberDto } from "@stellwall/shared";
import { api } from "../api.ts";
import { Button, Notice, PersonChip } from "../components/ui.tsx";
import { Icon } from "../icons.ts";
import { useMe } from "../session.ts";
import { de } from "../text/de.ts";
import { useMembers } from "../shopping-api.ts";
import {
  addDays, byDay, dayLabel, dayOf, hhmm, parseYmd, todayYmd, useCalendar, weekStart, ymd,
  type CalendarInstance, type EventDto, type EventInstance,
} from "../calendar-api.ts";
import { Header } from "./Home.tsx";
import { EventForm } from "./EventForm.tsx";

type View = "month" | "week" | "upcoming";
const UPCOMING_DAYS = 30;

function monthStart(s: string) {
  return s.slice(0, 8) + "01";
}
function shiftMonth(s: string, n: number) {
  const d = parseYmd(monthStart(s));
  d.setMonth(d.getMonth() + n);
  return ymd(d);
}

export function Calendar() {
  const me = useMe().data!;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const members = useMembers().data ?? [];
  const [params, setParams] = useSearchParams();
  const today = todayYmd();
  const sel = /^\d{4}-\d{2}-\d{2}$/.test(params.get("tag") ?? "") ? params.get("tag")! : today;
  const [view, setView] = useState<View>("month");
  const [mine, setMine] = useState(false);
  const [form, setForm] = useState<null | { event: EventDto | null; instance?: EventInstance }>(null);
  const [error, setError] = useState<string | null>(null);

  const range: [string, string] =
    view === "month" ? [weekStart(monthStart(sel)), addDays(weekStart(monthStart(sel)), 42)] : view === "week" ? [weekStart(sel), addDays(weekStart(sel), 7)] : [today, addDays(today, UPCOMING_DAYS)];
  const cal = useCalendar(range[0], range[1], mine);
  const days = byDay(cal.data ?? []);
  const select = (d: string) => setParams((p) => { p.set("tag", d); return p; }, { replace: true });

  const step = (n: number) => select(view === "month" ? shiftMonth(sel, n) : addDays(sel, 7 * n));
  const title =
    view === "month"
      ? parseYmd(sel).toLocaleDateString("de-DE", { month: "long", year: "numeric" })
      : view === "week"
        ? `${parseYmd(range[0]).toLocaleDateString("de-DE", { day: "numeric", month: "short" })} – ${parseYmd(addDays(range[0], 6)).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}`
        : de.calendar.views.upcoming;

  const open = async (i: CalendarInstance) => {
    if (i.kind === "birthday") return void navigate("/kalender/geburtstage");
    setError(null);
    try {
      setForm({ event: await api<EventDto>(`/api/events/${i.eventId}`), instance: i });
    } catch {
      setError(de.errors.generic);
    }
  };
  const done = async () => {
    await qc.invalidateQueries({ queryKey: ["calendar"] });
    setForm(null);
  };

  return (
    <div className="calpage">
      <Header sub={de.calendar.page} title={title} />
      <div className="caltop">
        <nav className="seg" aria-label={de.calendar.page}>
          {(["month", "week", "upcoming"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{de.calendar.views[v]}</button>
          ))}
        </nav>
        <div className="calright">
          <nav className="seg" aria-label={de.calendar.mine + " / " + de.calendar.all}>
            <button type="button" aria-pressed={mine} onClick={() => setMine(true)}>{de.calendar.mine}</button>
            <button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>{de.calendar.all}</button>
          </nav>
          {view !== "upcoming" && (
            <span className="calnav">
              <button type="button" className="iconbtn" aria-label={de.calendar.prev} onClick={() => step(-1)}><Chevron dir="left" /></button>
              <button type="button" className="pill" onClick={() => select(today)}>{de.calendar.today}</button>
              <button type="button" className="iconbtn" aria-label={de.calendar.next} onClick={() => step(1)}><Chevron dir="right" /></button>
            </span>
          )}
        </div>
      </div>
      <div className="caltools">
        <Button onClick={() => setForm({ event: null })}>{de.calendar.new}</Button>
        <Link to="/kalender/geburtstage" className="pill"><Icon.Geburtstage className="ico" aria-hidden="true" />{de.calendar.birthdays}</Link>
      </div>
      {error && <Notice>{error}</Notice>}

      {view === "month" && (
        <div className="calcols">
          <MonthGrid start={range[0]} month={sel.slice(0, 7)} sel={sel} today={today} days={days} members={members} onPick={select} />
          <DayList date={sel} today={today} list={days.get(sel) ?? []} members={members} onOpen={open} />
        </div>
      )}
      {view === "week" && (
        <div className="weeklist">
          {Array.from({ length: 7 }, (_, n) => addDays(range[0], n)).map((d) => (
            <DayBlock key={d} date={d} today={today} list={days.get(d) ?? []} members={members} onOpen={open} showEmpty />
          ))}
        </div>
      )}
      {view === "upcoming" && (
        <div className="weeklist">
          {[...days.keys()].filter((d) => d >= range[0] && d < range[1]).sort().map((d) => (
            <DayBlock key={d} date={d} today={today} list={days.get(d)!} members={members} onOpen={open} />
          ))}
          {cal.data && ![...days.keys()].some((d) => d >= range[0] && d < range[1]) && <div className="box"><p className="empty">{de.calendar.upcomingEmpty}</p></div>}
        </div>
      )}

      <div className="areas calimport">
        <Link to="/kalender/import" className="area">
          <Icon.Kalender className="ico" aria-hidden="true" />
          <b>{de.calendar.importLink}</b>
          <small />
        </Link>
      </div>

      {form && <EventForm event={form.event} instance={form.instance} defaultDate={sel} members={members} meId={me.id} onClose={() => setForm(null)} onDone={done} />}
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d={dir === "left" ? "m14.5 6-6 6 6 6" : "m9.5 6 6 6-6 6"} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const colorOf = (i: CalendarInstance, members: MemberDto[]) =>
  i.kind === "birthday" ? "var(--change)" : `var(--${members.find((m) => m.id === i.forWhom[0])?.color ?? "rule"})`;

function MonthGrid({ start, month, sel, today, days, members, onPick }: {
  start: string; month: string; sel: string; today: string; days: Map<string, CalendarInstance[]>; members: MemberDto[]; onPick: (d: string) => void;
}) {
  return (
    <div className="month" aria-label={de.calendar.views.month}>
      {de.calendar.weekdays.map((w) => <span key={w} className="wdh" aria-hidden="true">{w}</span>)}
      {Array.from({ length: 42 }, (_, n) => addDays(start, n)).map((d) => {
        const list = days.get(d) ?? [];
        const cls = ["mcell", d.slice(0, 7) !== month && "out", d === today && "today", d === sel && "sel"].filter(Boolean).join(" ");
        return (
          <button key={d} type="button" className={cls} aria-pressed={d === sel} aria-label={dayLabel(d) + (list.length ? `, ${list.length}` : "")} onClick={() => onPick(d)}>
            <span className="num">{Number(d.slice(8))}</span>
            <span className="dots" aria-hidden="true">
              {list.slice(0, 3).map((i, k) => <span key={k} className="dot" style={{ background: colorOf(i, members) }} />)}
              {list.length > 3 && <span className="moren">{de.calendar.more(list.length - 3)}</span>}
            </span>
            <span className="lbls" aria-hidden="true">
              {list.slice(0, 2).map((i, k) => <span key={k} className="lbl" style={{ borderColor: colorOf(i, members) }}>{i.title}</span>)}
              {list.length > 2 && <span className="moren">{de.calendar.more(list.length - 2)}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function headOf(date: string, today: string) {
  return (date === today ? de.calendar.today + ", " : "") + dayLabel(date);
}

function DayList({ date, today, list, members, onOpen }: { date: string; today: string; list: CalendarInstance[]; members: MemberDto[]; onOpen: (i: CalendarInstance) => void }) {
  return (
    <section className="daylist" aria-labelledby="day-h">
      <h2 id="day-h" className="dayh">{headOf(date, today)}</h2>
      {list.length === 0 ? <div className="box"><p className="empty">{de.calendar.dayEmpty}</p></div> : <CalList list={list} date={date} members={members} onOpen={onOpen} />}
    </section>
  );
}

function DayBlock({ date, today, list, members, onOpen, showEmpty }: { date: string; today: string; list: CalendarInstance[]; members: MemberDto[]; onOpen: (i: CalendarInstance) => void; showEmpty?: boolean }) {
  if (!list.length && !showEmpty) return null;
  return (
    <div className="dayblock">
      <h3 className={"dayh" + (date === today ? " is-today" : "")}>{headOf(date, today)}</h3>
      {list.length ? <CalList list={list} date={date} members={members} onOpen={onOpen} /> : <p className="dayempty">{de.calendar.dayEmpty}</p>}
    </div>
  );
}

export function CalList({ list, date, members, onOpen }: { list: CalendarInstance[]; date: string; members: MemberDto[]; onOpen: (i: CalendarInstance) => void }) {
  return (
    <ul className="box callist">
      {list.map((i) => (
        <CalRow key={(i.kind === "event" ? i.eventId : i.birthdayId) + i.date} i={i} date={date} members={members} onOpen={() => onOpen(i)} />
      ))}
    </ul>
  );
}

function CalRow({ i, date, members, onOpen }: { i: CalendarInstance; date: string; members: MemberDto[]; onOpen: () => void }) {
  const time = i.allDay ? de.calendar.allDayShort : dayOf(i) === date ? hhmm(i.start) : "…";
  return (
    <li className="calrow">
      <button type="button" className="calrow-main" onClick={onOpen}>
        <span className="ctime">{i.kind === "birthday" ? <Icon.Geburtstage className="ico" aria-label={de.calendar.birthdays} /> : time}</span>
        <span className="ctext">
          <span className="n">{i.title}</span>
          {i.kind === "birthday" ? (i.age !== null && <small>{de.calendar.turns(i.age)}</small>) : i.location && <small>{i.location}</small>}
        </span>
        {i.kind === "event" && (
          <span className="chips">
            {i.forWhom.map((id) => {
              const m = members.find((x) => x.id === id);
              return m ? <PersonChip key={id} name={m.displayName} color={m.color} /> : null;
            })}
          </span>
        )}
      </button>
    </li>
  );
}
