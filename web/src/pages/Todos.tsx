import { useEffect, useId, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MemberDto } from "@stellwall/shared";
import { api } from "../api.ts";
import { Button, Dialog, Notice, PersonChip } from "../components/ui.tsx";
import { VisibilitySheet, visibilityLabel } from "../components/VisibilitySheet.tsx";
import { Icon } from "../icons.ts";
import { useMe } from "../session.ts";
import { de } from "../text/de.ts";
import { useMembers, useTodos, type OccurrenceDto, type Recurrence, type TodoRule, type Visibility } from "../shopping-api.ts";
import { Header } from "./Home.tsx";

type View = "today" | "upcoming" | "undated";
const UNDATED = "1970-01-01";

export function Todos() {
  const me = useMe().data!;
  const qc = useQueryClient();
  const members = useMembers().data ?? [];
  const [view, setView] = useState<View>("today");
  const [mine, setMine] = useState(true);
  const list = useTodos(view, mine);
  const [form, setForm] = useState<null | { rule: TodoRule | null }>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["todos"] });
  const toggle = async (o: OccurrenceDto) => {
    setError(null);
    const date = o.date ?? UNDATED;
    try {
      if (o.done) await api(`/api/todos/${o.todoId}/done/${date}`, { method: "DELETE" });
      else await api(`/api/todos/${o.todoId}/done`, { method: "POST", body: { date } });
      await refresh();
    } catch {
      setError(de.errors.generic);
    }
  };
  const openRule = async (id: string) => setForm({ rule: await api<TodoRule>(`/api/todos/${id}`) });

  return (
    <div className="shop">
      <Header sub={de.todos.page} title={de.todos.title} />
      <div className="listhead">
        <nav className="seg" aria-label={de.todos.page}>
          {(["today", "upcoming", "undated"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{de.todos.views[v]}</button>
          ))}
        </nav>
        <nav className="seg" aria-label={de.todos.mine + " / " + de.todos.all}>
          <button type="button" aria-pressed={mine} onClick={() => setMine(true)}>{de.todos.mine}</button>
          <button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>{de.todos.all}</button>
        </nav>
      </div>
      <div className="actions" style={{ justifyContent: "flex-start", marginBottom: 14 }}>
        <Button onClick={() => setForm({ rule: null })}>{de.todos.new}</Button>
      </div>
      {error && <Notice>{error}</Notice>}
      {list.data && list.data.length === 0 && <div className="box"><p className="empty">{de.todos.empty[view]}</p></div>}
      {list.data && list.data.length > 0 && (
        <ul className="box todolist">
          {list.data.map((o) => (
            <TodoRow key={o.todoId + (o.date ?? "")} o={o} members={members} onToggle={() => toggle(o)} onOpen={() => void openRule(o.todoId)} />
          ))}
        </ul>
      )}
      {form && (
        <TodoForm rule={form.rule} members={members} meId={me.id} onClose={() => setForm(null)} onDone={async () => { await refresh(); setForm(null); }} />
      )}
    </div>
  );
}

function when(o: OccurrenceDto): string {
  if (!o.date) return "";
  const d = new Date(o.date + "T12:00:00");
  const day = d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" });
  const hasTime = o.at && new Date(o.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return hasTime && hasTime !== "00:00" ? `${day}, ${hasTime}` : day;
}

export function TodoRow({ o, members, onToggle, onOpen }: { o: OccurrenceDto; members: MemberDto[]; onToggle: () => void; onOpen: () => void }) {
  const person = (id: string) => members.find((m) => m.id === id);
  const done = !!o.done;
  return (
    <li className={"item" + (o.overdue ? " is-new" : "") + (done ? " is-done" : "")}>
      <button type="button" className="item-main" onClick={onOpen}>
        <span className="n">{o.title}</span>
        <small>
          {o.overdue && <span className="tag tag-inline">{de.todos.overdue}</span>} {when(o)}
          {done && " · " + de.todos.doneBy(person(o.done!.by)?.displayName ?? "?")}
        </small>
      </button>
      <span className="chips">
        {o.assignees.map((id) => {
          const m = person(id);
          return m ? <PersonChip key={id} name={m.displayName} color={m.color} /> : null;
        })}
      </span>
      {o.needsConfirm || !o.date ? (
        <button type="button" role="checkbox" aria-checked={done} className="ck" aria-label={done ? de.todos.uncheck(o.title) : de.todos.check(o.title)} onClick={onToggle}>
          <span>{done && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
    </li>
  );
}

type Draft = {
  title: string;
  visibility: Visibility;
  assignees: string[];
  startDate: string;
  time: string;
  repeat: Recurrence["kind"];
  weekdays: number[];
  until: string;
  needsConfirm: boolean;
  reminders: number[];
};

function draftOf(rule: TodoRule | null): Draft {
  return {
    title: rule?.title ?? "",
    visibility: rule?.visibility ?? { everyone: true, memberIds: [] },
    assignees: rule?.assignees ?? [],
    startDate: rule?.startDate ?? "",
    time: rule?.time ?? "",
    repeat: rule?.recurrence.kind ?? "none",
    weekdays: rule?.recurrence.kind === "weekly" ? rule.recurrence.weekdays : [],
    until: rule?.until ?? "",
    needsConfirm: rule?.needsConfirm ?? false,
    reminders: rule?.reminders ?? [],
  };
}

function TodoForm({ rule, members, meId, onClose, onDone }: { rule: TodoRule | null; members: MemberDto[]; meId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [d, setD] = useState<Draft>(draftOf(rule));
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sugg, setSugg] = useState<string[]>([]);
  const ids = useId();
  const isCreator = !rule || rule.createdBy === meId;

  useEffect(() => {
    const q = d.title.trim();
    if (!q || rule) return setSugg([]);
    const t = setTimeout(() => {
      api<{ name: string }[]>(`/api/todo-suggestions?q=${encodeURIComponent(q)}`).then((r) => setSugg(r.map((s) => s.name).filter((n) => n !== d.title))).catch(() => setSugg([]));
    }, 120);
    return () => clearTimeout(t);
  }, [d.title, rule]);

  const recurrence = (): Recurrence | null => {
    if (d.repeat === "weekly") return d.weekdays.length ? { kind: "weekly", weekdays: [...d.weekdays].sort() } : null;
    if (d.repeat === "monthly") return { kind: "monthly", day: Number(d.startDate.slice(8, 10)) || 1 };
    return { kind: d.repeat } as Recurrence;
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const rec = recurrence();
    if (!rec) return setError(de.todos.pickDay);
    if (rec.kind !== "none" && !d.startDate) return setError(de.todos.needsDate);
    const body = {
      title: d.title.trim(),
      assignees: d.assignees,
      startDate: d.startDate || null,
      time: d.time || null,
      recurrence: rec,
      until: rec.kind === "none" ? null : d.until || null,
      needsConfirm: d.needsConfirm,
      reminders: d.reminders,
      ...(isCreator ? { visibility: d.visibility } : {}),
    };
    try {
      if (rule) await api(`/api/todos/${rule.id}`, { method: "PATCH", body });
      else await api("/api/todos", { method: "POST", body });
      await onDone();
    } catch {
      setError(de.errors.invalidInput);
    }
  };

  const toggleIn = (arr: number[] | string[], v: number | string) =>
    (arr as (number | string)[]).includes(v) ? (arr as (number | string)[]).filter((x) => x !== v) : [...arr, v];

  return (
    <Dialog open title={rule ? de.todos.edit : de.todos.new} onClose={onClose}>
      <form className="form todoform" onSubmit={save}>
        <div className="field addbox" style={{ marginBottom: 0 }}>
          <label htmlFor={ids + "t"}>{de.todos.title}</label>
          <input id={ids + "t"} value={d.title} maxLength={80} required autoComplete="off" onChange={(e) => setD({ ...d, title: e.target.value })} />
          {sugg.length > 0 && (
            <div className="sugg" role="listbox">
              {sugg.map((s) => (
                <button key={s} type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => { setD({ ...d, title: s }); setSugg([]); }}>
                  <span>{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <fieldset className="field plain">
          <legend className="legend">{de.todos.assignees}</legend>
          <div className="people">
            {members.map((m) => (
              <label key={m.id} className="person">
                <input type="checkbox" checked={d.assignees.includes(m.id)} onChange={() => setD({ ...d, assignees: toggleIn(d.assignees, m.id) as string[] })} />
                <PersonChip name={m.displayName} color={m.color} />
                {m.displayName}
              </label>
            ))}
          </div>
        </fieldset>

        {isCreator && (
          <button type="button" className="pill" onClick={() => setSheet(true)}>
            <Icon.Members className="ico" aria-hidden="true" />
            {de.visibility.see(visibilityLabel(d.visibility, members, meId))}
          </button>
        )}

        <div className="row2">
          <div className="field">
            <label htmlFor={ids + "d"}>{de.todos.date}</label>
            <input id={ids + "d"} type="date" value={d.startDate} onChange={(e) => setD({ ...d, startDate: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={ids + "h"}>{de.todos.time}</label>
            <input id={ids + "h"} type="time" value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} />
          </div>
        </div>

        <div className="field">
          <label htmlFor={ids + "r"}>{de.todos.repeat}</label>
          <select id={ids + "r"} value={d.repeat} onChange={(e) => setD({ ...d, repeat: e.target.value as Recurrence["kind"] })}>
            {(["none", "daily", "weekly", "monthly"] as const).map((k) => <option key={k} value={k}>{de.todos.repeats[k]}</option>)}
          </select>
        </div>
        {d.repeat === "weekly" && (
          <div className="weekdays" role="group" aria-label={de.todos.repeats.weekly}>
            {de.todos.weekdays.map((w, i) => (
              <label key={w} className={"wd" + (d.weekdays.includes(i + 1) ? " on" : "")}>
                <input type="checkbox" aria-label={w} checked={d.weekdays.includes(i + 1)} onChange={() => setD({ ...d, weekdays: toggleIn(d.weekdays, i + 1) as number[] })} />
                {w}
              </label>
            ))}
          </div>
        )}
        {d.repeat !== "none" && (
          <div className="field">
            <label htmlFor={ids + "u"}>{de.todos.until}</label>
            <input id={ids + "u"} type="date" value={d.until} onChange={(e) => setD({ ...d, until: e.target.value })} />
          </div>
        )}

        <label className="opt">
          <input type="checkbox" checked={d.needsConfirm} onChange={(e) => setD({ ...d, needsConfirm: e.target.checked })} />
          <span><b>{de.todos.needsConfirm}</b><small>{de.todos.needsConfirmSub}</small></span>
        </label>

        <fieldset className="field plain">
          <legend className="legend">{de.todos.reminders}</legend>
          <div className="swatches">
            {de.todos.reminderChips.map(([min, label]) => (
              <label key={min} className="swatch">
                <input type="checkbox" checked={d.reminders.includes(min)} onChange={() => setD({ ...d, reminders: toggleIn(d.reminders, min) as number[] })} />
                {label}
              </label>
            ))}
          </div>
          <small>{de.todos.reminderLater}</small>
        </fieldset>

        {error && <Notice>{error}</Notice>}
        <div className="actions">
          {rule && isCreator && (
            <Button type="button" variant="danger" onClick={async () => { await api(`/api/todos/${rule.id}`, { method: "DELETE" }); await onDone(); }}>{de.todos.delete}</Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>{de.members.cancel}</Button>
          <Button type="submit">{de.members.save}</Button>
        </div>
      </form>
      <VisibilitySheet open={sheet} lead={d.title} value={d.visibility} members={members} meId={meId} onClose={() => setSheet(false)} onSave={(v) => { setD({ ...d, visibility: v }); setSheet(false); }} />
    </Dialog>
  );
}
