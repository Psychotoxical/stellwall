import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { MemberDto } from "@stellwall/shared";
import { api, ApiError } from "../api.ts";
import { Button, Dialog, Notice, PersonChip } from "../components/ui.tsx";
import { VisibilitySheet, visibilityLabel } from "../components/VisibilitySheet.tsx";
import { Icon } from "../icons.ts";
import { useMe } from "../session.ts";
import { de } from "../text/de.ts";
import { useMembers, type Visibility } from "../shopping-api.ts";
import { useBirthdays, type BirthdayDto } from "../calendar-api.ts";
import { Header } from "./Home.tsx";

const daysIn = (month: number) => new Date(Date.UTC(2024, month, 0)).getUTCDate();

export function Birthdays() {
  const me = useMe().data!;
  const qc = useQueryClient();
  const members = useMembers().data ?? [];
  const list = useBirthdays();
  const [form, setForm] = useState<null | { b: BirthdayDto | null }>(null);
  const done = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["birthdays"] }), qc.invalidateQueries({ queryKey: ["calendar"] })]);
    setForm(null);
  };
  const thisYear = new Date().getFullYear();

  return (
    <div className="shop">
      <Header sub={de.birthdays.page} title={de.birthdays.title} />
      <div className="caltools">
        <Button onClick={() => setForm({ b: null })}>{de.birthdays.new}</Button>
        <Link to="/kalender" className="pill"><Icon.Kalender className="ico" aria-hidden="true" />{de.calendar.page}</Link>
      </div>
      {list.data && list.data.length === 0 && <div className="box"><p className="empty">{de.birthdays.empty}</p></div>}
      {list.data && list.data.length > 0 && (
        <ul className="box callist">
          {list.data.map((b) => (
            <li key={b.id} className="calrow">
              <button type="button" className="calrow-main" onClick={() => setForm({ b })}>
                <span className="ctime"><Icon.Geburtstage className="ico" aria-hidden="true" /></span>
                <span className="ctext">
                  <span className="n">{b.name}</span>
                  <small>
                    {de.birthdays.when(b.day, de.birthdays.months[b.month - 1]!)}
                    {b.year ? " · " + de.calendar.turns(thisYear - b.year + (isPast(b) ? 1 : 0)) : ""}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {form && <BirthdayForm b={form.b} members={members} meId={me.id} onClose={() => setForm(null)} onDone={done} />}
    </div>
  );
}

function isPast(b: BirthdayDto) {
  const now = new Date();
  const m = now.getMonth() + 1;
  return b.month < m || (b.month === m && b.day < now.getDate());
}

function BirthdayForm({ b, members, meId, onClose, onDone }: { b: BirthdayDto | null; members: MemberDto[]; meId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const ids = useId();
  const isCreator = !b || b.createdBy === meId;
  const [name, setName] = useState(b?.name ?? "");
  const [day, setDay] = useState(b?.day ?? 1);
  const [month, setMonth] = useState(b?.month ?? new Date().getMonth() + 1);
  const [year, setYear] = useState(b?.year ? String(b.year) : "");
  const [visibility, setVisibility] = useState<Visibility>(b?.visibility ?? { everyone: true, memberIds: [] });
  const [remindDays, setRemindDays] = useState(b?.remindDays ?? 1);
  const [remindWho, setRemindWho] = useState<string[]>(b?.remindWho ?? [meId]);
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (day > daysIn(month)) return setError(de.birthdays.noSuchDay);
    const y = year.trim() ? Number(year) : null;
    const body = { name: name.trim(), day, month, year: y, remindDays, remindWho, ...(isCreator ? { visibility } : {}) };
    try {
      if (b) await api(`/api/birthdays/${b.id}`, { method: "PATCH", body });
      else await api("/api/birthdays", { method: "POST", body });
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? de.errors.invalidInput : de.errors.generic);
    }
  };

  return (
    <Dialog open title={b ? de.birthdays.edit : de.birthdays.new} onClose={onClose}>
      <form className="form todoform" onSubmit={save}>
        <div className="field">
          <label htmlFor={ids + "n"}>{de.birthdays.name}</label>
          <input id={ids + "n"} value={name} maxLength={80} required autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor={ids + "d"}>{de.birthdays.day}</label>
            <select id={ids + "d"} value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {Array.from({ length: 31 }, (_, n) => <option key={n + 1} value={n + 1}>{n + 1}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor={ids + "m"}>{de.birthdays.month}</label>
            <select id={ids + "m"} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {de.birthdays.months.map((m, n) => <option key={m} value={n + 1}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor={ids + "y"}>{de.birthdays.year}</label>
          <input id={ids + "y"} value={year} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />
          <small>{de.birthdays.yearHint}</small>
        </div>
        {isCreator && (
          <button type="button" className="pill" onClick={() => setSheet(true)}>
            <Icon.Members className="ico" aria-hidden="true" />
            {de.visibility.see(visibilityLabel(visibility, members, meId))}
          </button>
        )}
        <div className="field">
          <label htmlFor={ids + "r"}>{de.birthdays.remind}</label>
          <select id={ids + "r"} value={remindDays} onChange={(e) => setRemindDays(Number(e.target.value))}>
            {Object.entries(de.birthdays.remindDays).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <fieldset className="field plain">
          <legend className="legend">{de.birthdays.remindWho}</legend>
          <div className="people">
            {members.map((m) => (
              <label key={m.id} className="person">
                <input type="checkbox" checked={remindWho.includes(m.id)} onChange={() => setRemindWho(remindWho.includes(m.id) ? remindWho.filter((x) => x !== m.id) : [...remindWho, m.id])} />
                <PersonChip name={m.displayName} color={m.color} />
                {m.displayName}
              </label>
            ))}
          </div>
          <small>{de.calendar.reminderLater}</small>
        </fieldset>
        {error && <Notice>{error}</Notice>}
        <div className="actions">
          {b && isCreator && (
            <Button type="button" variant="danger" onClick={async () => { await api(`/api/birthdays/${b.id}`, { method: "DELETE" }); await onDone(); }}>{de.birthdays.delete}</Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>{de.members.cancel}</Button>
          <Button type="submit">{de.members.save}</Button>
        </div>
      </form>
      <VisibilitySheet open={sheet} lead={name} value={visibility} members={members} meId={meId} onClose={() => setSheet(false)} onSave={(v) => { setVisibility(v); setSheet(false); }} />
    </Dialog>
  );
}
