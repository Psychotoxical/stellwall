import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CATEGORIES } from "@stellwall/shared";
import { api } from "../api.ts";
import { Button, Dialog, Notice, TextField } from "../components/ui.tsx";
import { VisibilitySheet, visibilityLabel } from "../components/VisibilitySheet.tsx";
import { Icon } from "../icons.ts";
import { useMe } from "../session.ts";
import { de } from "../text/de.ts";
import { useBoard, useItems, useLists, useMembers, type ItemDto, type ListDto, type Suggestion, type Visibility } from "../shopping-api.ts";
import { Header } from "./Home.tsx";

export function Shopping() {
  const me = useMe().data!;
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const lists = useLists();
  const members = useMembers().data ?? [];
  const board = useBoard();
  const list = lists.data?.find((l) => l.id === params.get("liste")) ?? lists.data?.[0];
  const items = useItems(list?.id);
  const [sheet, setSheet] = useState<null | "tools" | "visibility" | "new" | "rename" | "delete" | "clear" | "learned" | { item: ItemDto }>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);

  // Highlight what others added and is still on the start page; it goes once it is ticked off there.
  const unseen = useMemo(() => new Set((board.data ?? []).flatMap((r) => (r.kind === "shopping" ? r.itemIds : []))), [board.data]);
  const frozenUnseen = useRef<Set<string> | null>(null);
  if (frozenUnseen.current === null && board.data) frozenUnseen.current = unseen;

  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.displayName ?? "?";
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["items", list?.id] });
    await qc.invalidateQueries({ queryKey: ["lists"] });
  };
  const run = async (f: () => Promise<unknown>) => {
    setError(null);
    try {
      await f();
      await refresh();
    } catch {
      setError(de.errors.generic);
    }
  };

  if (!list) {
    return (
      <div className="shop">
        <Header title={de.shopping.title} />
        <Button onClick={() => void qc.invalidateQueries({ queryKey: ["lists"] })}>{de.connection.retry}</Button>
      </div>
    );
  }
  const open = (items.data ?? []).filter((i) => !i.checkedAt);
  const checked = (items.data ?? []).filter((i) => i.checkedAt);
  const groups = CATEGORIES.map((c) => ({ c, rows: open.filter((i) => i.category === c) })).filter((g) => g.rows.length);
  const isCreator = list.createdBy === me.id;
  const seeLabel = visibilityLabel(list.visibility, members, me.id);
  const highlight = frozenUnseen.current ?? unseen;

  const toggle = (i: ItemDto) => run(() => api(`/api/items/${i.id}`, { method: "PATCH", body: { checked: !i.checkedAt } }));

  return (
    <div className="shop">
      <Header sub={de.shopping.title} title={list.name} />
      {(lists.data?.length ?? 0) > 1 && (
        <nav className="seg listbar" aria-label={de.shopping.lists}>
          {lists.data!.map((l) => (
            <button key={l.id} type="button" aria-pressed={l.id === list.id} onClick={() => setParams({ liste: l.id })}>
              {l.name}
              {l.openCount > 0 && <span className="count">{l.openCount}</span>}
            </button>
          ))}
        </nav>
      )}
      <div className="listhead">
        <button type="button" className="pill" onClick={() => setSheet("visibility")} aria-label={de.visibility.see(seeLabel)}>
          <Icon.Members className="ico" aria-hidden="true" />
          {de.visibility.see(seeLabel)}
        </button>
        <Button variant="ghost" className="btn-small" onClick={() => setSheet("tools")}>{de.shopping.manage}</Button>
      </div>

      <AddItem listId={list.id} onAdded={refresh} />
      {error && <Notice>{error}</Notice>}

      {groups.length === 0 && <div className="box"><p className="empty">{de.shopping.empty}</p></div>}
      {groups.map((g) => (
        <section key={g.c} aria-label={g.c}>
          <h3 className="cat">{g.c}</h3>
          <div className="box">
            {g.rows.map((i) => (
              <ItemRow key={i.id} item={i} isNew={highlight.has(i.id)} meta={i.addedBy !== me.id ? de.shopping.from(nameOf(i.addedBy)) : null} onToggle={() => toggle(i)} onEdit={() => setSheet({ item: i })} />
            ))}
          </div>
        </section>
      ))}

      {checked.length > 0 && (
        <section aria-label={de.shopping.checked} className="checked">
          <div className="sechead"><h2>{de.shopping.checked}</h2><small>{de.shopping.vanishHint}</small></div>
          <div className="box">
            {checked.map((i) => (
              <ItemRow key={i.id} item={i} isNew={false} meta={de.shopping.checkedBy(nameOf(i.checkedBy))} onToggle={() => toggle(i)} onEdit={() => setSheet({ item: i })} />
            ))}
          </div>
        </section>
      )}

      <VisibilitySheet
        open={sheet === "visibility"}
        lead={isCreator ? de.shopping.title + ": " + list.name : de.visibility.onlyCreator}
        value={list.visibility}
        members={members}
        meId={me.id}
        onClose={() => setSheet(null)}
        onSave={async (v: Visibility) => {
          if (!isCreator) return setSheet(null);
          await run(() => api(`/api/lists/${list.id}`, { method: "PATCH", body: { visibility: v } }));
          setSheet(null);
        }}
      />
      <Dialog open={sheet === "tools"} title={de.shopping.manage} onClose={() => setSheet(null)}>
        <div className="toolist">
          <Button variant="ghost" onClick={() => setSheet("new")}>{de.shopping.newList}</Button>
          <Button variant="ghost" onClick={() => setSheet("rename")}>{de.shopping.renameList}</Button>
          <Button variant="ghost" onClick={() => setSheet("clear")}>{de.shopping.clearList}</Button>
          <Button variant="ghost" onClick={() => setSheet("learned")}>{de.shopping.learned}</Button>
          {isCreator && <Button variant="danger" onClick={() => setSheet("delete")}>{de.shopping.deleteList}</Button>}
          <Button variant="ghost" onClick={() => setSheet(null)}>{de.members.cancel}</Button>
        </div>
      </Dialog>
      <ListNameDialog
        open={sheet === "new" || sheet === "rename"}
        title={sheet === "new" ? de.shopping.newList : de.shopping.renameList}
        initial={sheet === "rename" ? list.name : ""}
        onClose={() => setSheet(null)}
        onSave={async (name) => {
          if (sheet === "new") {
            // A new list asks who may see it before anything is written to it.
            setNewName(name);
            setSheet(null);
            return;
          }
          await run(() => api(`/api/lists/${list.id}`, { method: "PATCH", body: { name } }));
          setSheet(null);
        }}
      />
      <VisibilitySheet
        open={newName !== null}
        lead={de.shopping.newList + ": " + (newName ?? "")}
        value={{ everyone: true, memberIds: [] }}
        members={members}
        meId={me.id}
        onClose={() => setNewName(null)}
        onSave={async (v: Visibility) => {
          const l = await api<ListDto>("/api/lists", { method: "POST", body: { name: newName, visibility: v } });
          setNewName(null);
          await refresh();
          setParams({ liste: l.id });
        }}
      />
      <Dialog open={sheet === "clear"} title={de.shopping.clearListConfirm(list.name)} onClose={() => setSheet(null)}>
        <div className="actions">
          <Button variant="ghost" onClick={() => setSheet(null)}>{de.members.cancel}</Button>
          <Button variant="danger" onClick={async () => { await run(() => api(`/api/lists/${list.id}/items`, { method: "DELETE" })); setSheet(null); }}>
            {de.shopping.clearList}
          </Button>
        </div>
      </Dialog>
      <Dialog open={sheet === "delete"} title={de.shopping.deleteListConfirm(list.name)} onClose={() => setSheet(null)}>
        <div className="actions">
          <Button variant="ghost" onClick={() => setSheet(null)}>{de.members.cancel}</Button>
          <Button variant="danger" onClick={async () => { await run(() => api(`/api/lists/${list.id}`, { method: "DELETE" })); setParams({}); setSheet(null); }}>
            {de.shopping.deleteList}
          </Button>
        </div>
      </Dialog>
      <LearnedDialog open={sheet === "learned"} onClose={() => setSheet(null)} />
      {typeof sheet === "object" && sheet && (
        <EditItem item={sheet.item} onClose={() => setSheet(null)} onDone={async () => { await refresh(); setSheet(null); }} />
      )}
    </div>
  );
}

function ItemRow({ item, isNew, meta, onToggle, onEdit }: { item: ItemDto; isNew: boolean; meta: string | null; onToggle: () => void; onEdit: () => void }) {
  const done = !!item.checkedAt;
  return (
    <div className={"item" + (isNew ? " is-new" : "") + (done ? " is-done" : "")}>
      <button type="button" className="item-main" onClick={onEdit}>
        <span className="n">{item.name}</span>
        {meta && <small>{meta}</small>}
      </button>
      {/* Always there, also empty: the tick boxes stay in one column. */}
      <span className="q">{item.quantity}</span>
      <button type="button" role="checkbox" aria-checked={done} className="ck" aria-label={done ? de.shopping.uncheck(item.name) : de.shopping.check(item.name)} onClick={onToggle}>
        <span>{done && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>
      </button>
    </div>
  );
}

/** What the amount window is about: the name, its section, and whether the section still has to be chosen. */
type Pick = { name: string; category: string; known: boolean };

function AddItem({ listId, onAdded }: { listId: string; onAdded: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [pick, setPick] = useState<Pick | null>(null);
  const [sugg, setSugg] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = name.trim();
    if (!q) return setSugg([]);
    const t = setTimeout(() => {
      api<Suggestion[]>(`/api/suggestions?q=${encodeURIComponent(q)}`).then(setSugg).catch(() => setSugg([]));
    }, 120);
    return () => clearTimeout(t);
  }, [name]);

  // A suggestion knows its section; a typed name asks the server what it would get.
  const choose = async (picked?: Suggestion) => {
    const n = (picked?.name ?? name).trim();
    if (!n || busy) return;
    if (picked) return setPick({ name: picked.name, category: picked.category, known: true });
    const exact = sugg.find((s) => s.name.toLowerCase() === n.toLowerCase());
    if (exact) return setPick({ name: exact.name, category: exact.category, known: true });
    setBusy(true);
    try {
      setPick(await api<Pick>(`/api/catalog/guess?name=${encodeURIComponent(n)}`));
    } catch {
      setPick({ name: n, category: "Sonstiges", known: false });
    } finally {
      setBusy(false);
    }
  };

  const add = async (quantity: string, category: string) => {
    if (!pick) return;
    await api(`/api/lists/${listId}/items`, { method: "POST", body: { name: pick.name, quantity, category } });
    setPick(null);
    setName("");
    setSugg([]);
    setActive(-1);
    await onAdded();
    inputRef.current?.focus();
  };

  const forget = async (s: Suggestion) => {
    await api(`/api/catalog/learned?name=${encodeURIComponent(s.name)}`, { method: "DELETE" });
    setSugg((all) => all.filter((x) => x.name !== s.name));
    inputRef.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && sugg.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % sugg.length);
    } else if (e.key === "ArrowUp" && sugg.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + sugg.length) % sugg.length);
    } else if (e.key === "Escape") setSugg([]);
    else if (e.key === "Enter") {
      e.preventDefault();
      void choose(active >= 0 ? sugg[active] : undefined);
    }
  };

  return (
    <form className="addbox" onSubmit={(e: FormEvent) => { e.preventDefault(); void choose(); }}>
      <label htmlFor={listboxId + "-in"}>{de.shopping.add}</label>
      <div className="addrow">
        <input
          ref={inputRef}
          id={listboxId + "-in"}
          value={name}
          maxLength={80}
          autoComplete="off"
          placeholder={de.shopping.addPlaceholder}
          role="combobox"
          aria-expanded={sugg.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={active >= 0 ? `${listboxId}-${active}` : undefined}
          onChange={(e) => { setName(e.target.value); setActive(-1); }}
          onKeyDown={onKey}
        />
        <Button type="submit" disabled={busy || !name.trim()}>{de.shopping.addButton}</Button>
      </div>
      {sugg.length > 0 && (
        <div className="sugg" id={listboxId} role="listbox">
          {sugg.map((s, k) => (
            <div key={s.name} className={"srow" + (k === active ? " active" : "")}>
              <button id={`${listboxId}-${k}`} type="button" role="option" aria-selected={k === active} onMouseDown={(e) => e.preventDefault()} onClick={() => void choose(s)}>
                <span>{s.name}</span>
                <small>{s.category}</small>
              </button>
              {s.learned && (
                <button type="button" className="forget" aria-label={de.shopping.forget(s.name)} onMouseDown={(e) => e.preventDefault()} onClick={() => void forget(s)}>×</button>
              )}
            </div>
          ))}
        </div>
      )}
      {pick && <AmountDialog pick={pick} onClose={() => { setPick(null); inputRef.current?.focus(); }} onAdd={add} />}
    </form>
  );
}

/** One tap on a number puts the item on the list; a new name also gets its section here. */
function AmountDialog({ pick, onClose, onAdd }: { pick: Pick; onClose: () => void; onAdd: (quantity: string, category: string) => Promise<void> }) {
  const [category, setCategory] = useState(pick.category);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const ids = useId();
  const go = async (quantity: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await onAdd(quantity, category);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open title={pick.name} onClose={onClose}>
      <div className="form">
        {!pick.known && (
          <fieldset className="sections">
            <legend>{de.shopping.sectionFor}</legend>
            {CATEGORIES.map((c) => (
              <label key={c} className="section">
                <input type="radio" name={ids + "c"} value={c} checked={category === c} onChange={() => setCategory(c)} />
                <span>{c}</span>
              </label>
            ))}
          </fieldset>
        )}
        <p className="howmany">{de.shopping.howMany}</p>
        <div className="amounts">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className="amount" autoFocus={n === 1} disabled={busy} onClick={() => void go(String(n))}>{n}</button>
          ))}
        </div>
        <div className="field">
          <label htmlFor={ids + "o"}>{de.shopping.otherAmount}</label>
          <input id={ids + "o"} value={other} maxLength={30} autoComplete="off" placeholder={de.shopping.otherAmountHint} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && other.trim()) { e.preventDefault(); void go(other.trim()); } }} />
        </div>
        <div className="actions">
          <Button type="button" variant="ghost" onClick={onClose}>{de.members.cancel}</Button>
          <Button type="button" disabled={busy || !other.trim()} onClick={() => void go(other.trim())}>{de.shopping.addButton}</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** What the family typed in themselves: move it to its section for good, or forget a misspelling. */
function LearnedDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<{ name: string; category: string }[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setRows(null);
    api<{ name: string; category: string }[]>("/api/catalog/learned").then(setRows).catch(() => setRows([]));
  }, [open]);
  const move = async (name: string, category: string) => {
    setRows((all) => all?.map((r) => (r.name === name ? { ...r, category } : r)) ?? null);
    await api("/api/catalog/learned", { method: "PATCH", body: { name, category } });
  };
  const forget = async (name: string) => {
    await api(`/api/catalog/learned?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    setRows((all) => all?.filter((r) => r.name !== name) ?? null);
  };
  return (
    <Dialog open={open} title={de.shopping.learned} onClose={onClose}>
      <p>{de.shopping.learnedLead}</p>
      {rows && rows.length === 0 && <p className="muted">{de.shopping.learnedEmpty}</p>}
      {rows && rows.length > 0 && (
        <ul className="learned">
          {rows.map((r) => (
            <li key={r.name}>
              <span className="n">{r.name}</span>
              <select aria-label={de.shopping.sectionOf(r.name)} value={r.category} onChange={(e) => void move(r.name, e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="button" className="forget" aria-label={de.shopping.forget(r.name)} onClick={() => void forget(r.name)}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="actions">
        <Button type="button" variant="ghost" onClick={onClose}>{de.shopping.learnedDone}</Button>
      </div>
    </Dialog>
  );
}

function ListNameDialog({ open, title, initial, onClose, onSave }: { open: boolean; title: string; initial: string; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initial);
  useEffect(() => { if (open) setName(initial); }, [open, initial]);
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void onSave(name.trim()); }}>
        <TextField label={de.shopping.listName} value={name} maxLength={40} required onChange={(e) => setName(e.target.value)} />
        <div className="actions">
          <Button type="button" variant="ghost" onClick={onClose}>{de.members.cancel}</Button>
          <Button type="submit">{de.members.save}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditItem({ item, onClose, onDone }: { item: ItemDto; onClose: () => void; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ name: item.name, quantity: item.quantity, category: item.category });
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const changed = Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== item[k as keyof typeof f]));
      if (Object.keys(changed).length) await api(`/api/items/${item.id}`, { method: "PATCH", body: changed });
      await onDone();
    } catch {
      setError(de.errors.invalidInput);
    }
  };
  return (
    <Dialog open title={de.shopping.editItem} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <TextField label={de.shopping.name} value={f.name} maxLength={80} required onChange={(e) => setF({ ...f, name: e.target.value })} />
        <TextField label={de.shopping.quantity} value={f.quantity} maxLength={30} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
        <div className="field">
          <label htmlFor="item-cat">{de.shopping.category}</label>
          <select id="item-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {error && <Notice>{error}</Notice>}
        <div className="actions">
          <Button type="button" variant="danger" onClick={async () => { await api(`/api/items/${item.id}`, { method: "DELETE" }); await onDone(); }}>{de.shopping.deleteItem}</Button>
          <Button type="button" variant="ghost" onClick={onClose}>{de.members.cancel}</Button>
          <Button type="submit">{de.members.save}</Button>
        </div>
      </form>
    </Dialog>
  );
}
