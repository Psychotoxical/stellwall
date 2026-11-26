import { useId, useState, type FormEvent } from "react";
import type { MemberDto } from "@stellwall/shared";
import { describeRule, simpleKind, simpleRule, type SimpleKind } from "@stellwall/shared";
import { api } from "../api.ts";
import { Button, Dialog, Notice, PersonChip } from "../components/ui.tsx";
import { de } from "../text/de.ts";
import { addDays, hhmm, parseYmd, ymd, type EventDto, type EventInstance } from "../calendar-api.ts";

type Repeat = SimpleKind | "none" | "custom";
type Scope = "one" | "following" | "all";

type Draft = {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  notes: string;
  forWhom: string[];
  seeAll: boolean;
  repeat: Repeat;
  reminders: number[];
};

const at = (date: string, time: string) => new Date(`${date}T${time || "00:00"}`);
const dayDiff = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86_400_000);

function initial(ev: EventDto | null, inst: EventInstance | undefined, defaultDate: string, meId: string): Draft {
  if (!ev) {
    const now = new Date();
    const h = String(Math.min(now.getHours() + 1, 22)).padStart(2, "0");
    const h2 = String(Math.min(now.getHours() + 2, 23)).padStart(2, "0");
    return { title: "", allDay: false, startDate: defaultDate, startTime: `${h}:00`, endDate: defaultDate, endTime: `${h2}:00`, location: "", notes: "", forWhom: [meId], seeAll: false, repeat: "none", reminders: [] };
  }
  const start = inst?.start ?? ev.start;
  const end = inst?.end ?? ev.end;
  return {
    title: inst?.title ?? ev.title,
    allDay: ev.allDay,
    startDate: inst?.date ?? ev.startDate,
    startTime: ev.allDay ? "" : hhmm(start),
    endDate: ev.allDay ? (inst?.endDate ?? ev.endDate) : ymd(new Date(end)),
    endTime: ev.allDay ? "" : hhmm(end),
    location: inst?.location ?? ev.location,
    notes: ev.notes,
    forWhom: ev.forWhom,
    seeAll: ev.seeAll,
    repeat: simpleKind(ev.rrule),
    reminders: ev.reminders,
  };
}

type Props = {
  event: EventDto | null;
  instance?: EventInstance;
  defaultDate: string;
  members: MemberDto[];
  meId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
};

/** New or existing event; changing a series asks which occurrences are meant. */
export function EventForm({ event, instance, defaultDate, members, meId, onClose, onDone }: Props) {
  const start0 = initial(event, instance, defaultDate, meId);
  const [d, setD] = useState<Draft>(start0);
  const [ask, setAsk] = useState<null | "save" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = useId();
  const isCreator = !event || event.createdBy === meId;
  const isSeries = !!event?.rrule;
  // People a non-creator may add: only those who can already see it.
  const canPick = (id: string) => isCreator || !event || event.seeAll || event.forWhom.includes(id) || event.createdBy === id;

  const timesChanged = d.allDay !== start0.allDay || d.startDate !== start0.startDate || d.endDate !== start0.endDate || d.startTime !== start0.startTime || d.endTime !== start0.endTime;

  const validate = () => {
    if (!d.title.trim()) return de.errors.invalidInput;
    if (!d.forWhom.length) return de.calendar.pickPerson;
    if (d.allDay ? d.endDate < d.startDate : !(at(d.endDate, d.endTime) > at(d.startDate, d.startTime))) return de.calendar.endBeforeStart;
    return null;
  };

  const timeFields = (startDate: string, endDate: string, startT: Date, endT: Date) =>
    d.allDay ? { allDay: true, startDate, endDate } : { allDay: false, start: startT.toISOString(), end: endT.toISOString() };

  const ruleFor = (startDate: string) => (d.repeat === "none" ? null : d.repeat === "custom" ? event!.rrule : simpleRule(d.repeat, startDate));

  const create = async () => {
    const body = {
      title: d.title.trim(),
      location: d.location.trim(),
      notes: d.notes.trim(),
      ...timeFields(d.startDate, d.endDate, at(d.startDate, d.startTime), at(d.endDate, d.endTime)),
      rrule: ruleFor(d.startDate),
      forWhom: d.forWhom,
      seeAll: d.seeAll,
      reminders: d.reminders,
    };
    await api("/api/events", { method: "POST", body });
  };

  const update = async (scope: Scope) => {
    const ev = event!;
    const body: Record<string, unknown> = {};
    if (d.title.trim() !== start0.title) body.title = d.title.trim();
    if (d.location.trim() !== start0.location) body.location = d.location.trim();
    if (scope !== "one") {
      if (d.notes.trim() !== start0.notes) body.notes = d.notes.trim();
      if (d.reminders.join() !== start0.reminders.join()) body.reminders = d.reminders;
      if (d.forWhom.join() !== start0.forWhom.join()) body.forWhom = d.forWhom;
      if (isCreator && d.seeAll !== start0.seeAll) body.seeAll = d.seeAll;
    }
    let seriesStart = scope === "following" ? d.startDate : ev.startDate;
    if (timesChanged) {
      if (scope === "one" || scope === "following" || !isSeries) {
        if (!(scope === "one" && d.allDay)) Object.assign(body, timeFields(d.startDate, d.endDate, at(d.startDate, d.startTime), at(d.endDate, d.endTime)));
      } else {
        // The whole series moves by the same amount as the occurrence that was edited.
        if (d.allDay) {
          const shift = dayDiff(start0.startDate, d.startDate);
          seriesStart = addDays(ev.startDate, shift);
          Object.assign(body, { allDay: true, startDate: seriesStart, endDate: addDays(seriesStart, dayDiff(d.startDate, d.endDate)) });
        } else {
          const base = d.allDay !== start0.allDay ? at(ev.startDate, d.startTime) : new Date(new Date(ev.start).getTime() + (at(d.startDate, d.startTime).getTime() - at(start0.startDate, start0.startTime).getTime()));
          const len = at(d.endDate, d.endTime).getTime() - at(d.startDate, d.startTime).getTime();
          seriesStart = ymd(base);
          Object.assign(body, { allDay: false, start: base.toISOString(), end: new Date(base.getTime() + len).toISOString() });
        }
      }
    }
    if (scope !== "one" && d.repeat !== start0.repeat) body.rrule = ruleFor(seriesStart);
    const q = isSeries ? `?scope=${scope}&date=${instance?.date ?? ev.startDate}` : "?scope=all";
    await api(`/api/events/${ev.id}${q}`, { method: "PATCH", body });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onDone();
    } catch {
      setError(de.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) return setError(v);
    if (!event) return void run(create);
    if (isSeries) return setAsk("save");
    void run(() => update("all"));
  };

  const remove = (scope: Scope) => run(() => api(`/api/events/${event!.id}?scope=${scope}${isSeries ? `&date=${instance?.date ?? event!.startDate}` : ""}`, { method: "DELETE" }).then(() => undefined));

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const scopes: Scope[] = ask === "delete" && !isCreator ? ["one"] : ["one", "following", "all"];

  return (
    <Dialog open title={event ? de.calendar.edit : de.calendar.new} onClose={onClose}>
      <form className="form todoform evform" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={ids + "t"}>{de.calendar.title}</label>
          <input id={ids + "t"} value={d.title} maxLength={120} required autoComplete="off" enterKeyHint="next" onChange={(e) => setD({ ...d, title: e.target.value })} />
        </div>

        <label className="opt opt-compact">
          <input type="checkbox" checked={d.allDay} onChange={(e) => setD({ ...d, allDay: e.target.checked, startTime: e.target.checked ? "" : d.startTime || "09:00", endTime: e.target.checked ? "" : d.endTime || "10:00" })} />
          <span><b>{de.calendar.allDay}</b></span>
        </label>

        <fieldset className="field plain">
          <legend className="legend">{de.calendar.from}</legend>
          <div className={d.allDay ? "" : "row2"}>
            <input aria-label={de.calendar.from + " " + de.calendar.date} type="date" value={d.startDate} required onChange={(e) => {
              const shift = dayDiff(d.startDate, e.target.value || d.startDate);
              setD({ ...d, startDate: e.target.value, endDate: e.target.value ? addDays(d.endDate, shift) : d.endDate });
            }} />
            {!d.allDay && <input aria-label={de.calendar.from + " " + de.calendar.time} type="time" value={d.startTime} required onChange={(e) => setD({ ...d, startTime: e.target.value })} />}
          </div>
        </fieldset>
        <fieldset className="field plain">
          <legend className="legend">{de.calendar.to}</legend>
          <div className={d.allDay ? "" : "row2"}>
            <input aria-label={de.calendar.to + " " + de.calendar.date} type="date" value={d.endDate} min={d.startDate} required onChange={(e) => setD({ ...d, endDate: e.target.value })} />
            {!d.allDay && <input aria-label={de.calendar.to + " " + de.calendar.time} type="time" value={d.endTime} required onChange={(e) => setD({ ...d, endTime: e.target.value })} />}
          </div>
        </fieldset>

        <fieldset className="field plain">
          <legend className="legend">{de.calendar.forWhom}</legend>
          <div className="people">
            {members.map((m) => (
              <label key={m.id} className="person">
                <input type="checkbox" checked={d.forWhom.includes(m.id)} disabled={!canPick(m.id) && !d.forWhom.includes(m.id)} onChange={() => setD({ ...d, forWhom: toggle(d.forWhom, m.id) })} />
                <PersonChip name={m.displayName} color={m.color} />
                {m.displayName}
              </label>
            ))}
          </div>
        </fieldset>

        {isCreator && (
          <label className="opt">
            <input type="checkbox" checked={d.seeAll} onChange={(e) => setD({ ...d, seeAll: e.target.checked })} />
            <span><b>{de.calendar.seeAll}</b><small>{de.calendar.seeAllSub}</small></span>
          </label>
        )}

        <div className="field">
          <label htmlFor={ids + "r"}>{de.calendar.repeat}</label>
          <select id={ids + "r"} value={d.repeat} onChange={(e) => setD({ ...d, repeat: e.target.value as Repeat })}>
            {(["none", "weekly", "biweekly", "monthly", "yearly"] as const).map((k) => <option key={k} value={k}>{de.calendar.repeats[k]}</option>)}
            {start0.repeat === "custom" && <option value="custom">{describeRule(event!.rrule!)}</option>}
          </select>
          {d.repeat !== "none" && d.repeat !== "custom" && <small>{describeRule(simpleRule(d.repeat, d.startDate))}</small>}
        </div>

        <div className="field">
          <label htmlFor={ids + "l"}>{de.calendar.location}</label>
          <input id={ids + "l"} value={d.location} maxLength={200} autoComplete="off" onChange={(e) => setD({ ...d, location: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={ids + "n"}>{de.calendar.notes}</label>
          <textarea id={ids + "n"} value={d.notes} maxLength={2000} rows={3} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </div>

        <fieldset className="field plain">
          <legend className="legend">{de.calendar.reminders}</legend>
          <div className="swatches">
            {de.calendar.reminderChips.map(([min, label]) => (
              <label key={min} className="swatch">
                <input type="checkbox" checked={d.reminders.includes(min)} onChange={() => setD({ ...d, reminders: toggle(d.reminders, min) })} />
                {label}
              </label>
            ))}
          </div>
          <small>{de.calendar.reminderLater}</small>
        </fieldset>

        {error && <Notice>{error}</Notice>}
        <div className="actions">
          {event && (isCreator || isSeries) && (
            <Button type="button" variant="danger" disabled={busy} onClick={() => (isSeries ? setAsk("delete") : void remove("all"))}>{de.calendar.delete}</Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>{de.members.cancel}</Button>
          <Button type="submit" disabled={busy}>{de.members.save}</Button>
        </div>
      </form>

      <Dialog open={ask !== null} title={de.calendar.scopeTitle} onClose={() => setAsk(null)}>
        <p>{ask === "delete" ? de.calendar.scopeDelete : de.calendar.scopeSave}</p>
        <div className="opts">
          {scopes.map((s) => (
            <Button key={s} type="button" variant={s === "one" ? "primary" : "ghost"} disabled={busy} onClick={() => {
              const which = ask;
              setAsk(null);
              void (which === "delete" ? remove(s) : run(() => update(s)));
            }}>
              {de.calendar.scopes[s]}
            </Button>
          ))}
        </div>
        <div className="actions">
          <Button type="button" variant="ghost" onClick={() => setAsk(null)}>{de.members.cancel}</Button>
        </div>
      </Dialog>
    </Dialog>
  );
}
