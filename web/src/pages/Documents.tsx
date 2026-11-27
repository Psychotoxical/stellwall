import { useEffect, useId, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { MemberDto } from "@stellwall/shared";
import { ApiError, api } from "../api.ts";
import { Button, Dialog, Notice } from "../components/ui.tsx";
import { VisibilitySheet, visibilityLabel } from "../components/VisibilitySheet.tsx";
import { Icon } from "../icons.ts";
import { useMe } from "../session.ts";
import { de } from "../text/de.ts";
import { useMembers, type Visibility } from "../shopping-api.ts";
import { MAX_BYTES, daysLeft, nameFromFile, uploadDocument, useCategories, useDocuments, type DocumentDto } from "../documents-api.ts";
import { Header } from "./Home.tsx";

export const showDate = (d: string) => d.split("-").reverse().join(".");

export function errorText(e: unknown) {
  return e instanceof ApiError ? (de.documents.errors[e.code] ?? (e.status === 400 ? de.errors.invalidInput : de.errors.generic)) : de.errors.generic;
}

/** "gültig bis …", marked from a month before it runs out. */
export function Validity({ d }: { d: DocumentDto }) {
  if (!d.validUntil) return null;
  const left = daysLeft(d.validUntil);
  const text = left < 0 ? de.documents.expired(showDate(d.validUntil)) : de.documents.until(showDate(d.validUntil));
  return <span className={"docvalid" + (left <= 30 ? " is-soon" : "")}>{text}</span>;
}

export function Documents() {
  const me = useMe().data!;
  const qc = useQueryClient();
  const members = useMembers().data ?? [];
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [form, setForm] = useState<null | { doc: DocumentDto | null }>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const list = useDocuments(debounced, category);
  const categories = useCategories().data ?? [];
  const off = list.error instanceof ApiError && list.error.code === "documents_not_configured";
  const done = async () => {
    await qc.invalidateQueries({ queryKey: ["documents"] });
    setForm(null);
  };

  return (
    <div className="shop">
      <Header sub={de.documents.page} title={de.documents.title} />
      {off ? (
        <div className="box"><p className="empty">{de.documents.notConfigured}</p></div>
      ) : (
        <>
          <div className="caltools">
            <Button onClick={() => setForm({ doc: null })}>{de.documents.upload}</Button>
          </div>
          <div className="field docsearch">
            <input type="search" aria-label={de.documents.search} placeholder={de.documents.search} value={q} maxLength={200} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="chips docchips" role="group" aria-label={de.documents.category}>
            {[null, ...categories].map((c) => (
              <button key={c ?? ""} type="button" className="pill" aria-pressed={category === c} onClick={() => setCategory(c)}>{c ?? de.documents.all}</button>
            ))}
          </div>
          {list.data && list.data.length === 0 && <div className="box"><p className="empty">{debounced.trim() || category ? de.documents.none : de.documents.empty}</p></div>}
          {list.data && list.data.length > 0 && (
            <ul className="box callist">
              {list.data.map((d) => (
                <li key={d.id} className="calrow">
                  <Link to={`/dokumente/${d.id}`} className="calrow-main">
                    <span className="ctime"><Icon.Dokumente className="ico" aria-hidden="true" /></span>
                    <span className="ctext">
                      <span className="n">{d.name}</span>
                      <small>
                        {[d.category, d.pages ? de.documents.pages(d.pages) : null].filter(Boolean).join(" · ")}
                        {d.validUntil && <> {d.category || d.pages ? " · " : ""}<Validity d={d} /></>}
                      </small>
                      {d.snippet && <small className="snippet">{d.snippet}</small>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {form && <DocumentForm doc={form.doc} members={members} me={me} categories={categories} onClose={() => setForm(null)} onDone={done} />}
    </div>
  );
}

/** New upload (doc null) or the details of an existing document. */
export function DocumentForm({ doc, members, me, categories, onClose, onDone }: { doc: DocumentDto | null; members: MemberDto[]; me: MemberDto; categories: string[]; onClose: () => void; onDone: () => Promise<void> }) {
  const ids = useId();
  const isCreator = !doc || doc.createdBy === me.id;
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState(doc?.name ?? "");
  const [category, setCategory] = useState<string>(doc?.category ?? "");
  const [own, setOwn] = useState(!!doc?.category && !categories.includes(doc.category));
  const [validUntil, setValidUntil] = useState(doc?.validUntil ?? "");
  const [remindDays, setRemindDays] = useState<number>(doc?.remindDays ?? 30);
  const [visibility, setVisibility] = useState<Visibility>(doc?.visibility ?? { everyone: true, memberIds: [] });
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (f: File | null) => {
    setError(null);
    if (f && f.size > MAX_BYTES) {
      setFile(null);
      return setError(de.documents.errors.too_large!);
    }
    setFile(f);
    if (f && !name.trim()) setName(nameFromFile(f.name));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!doc && !file) return setError(de.errors.invalidInput);
    const meta = { name: name.trim(), category: category.trim() || null, validUntil: validUntil || null, remindDays, ...(isCreator ? { visibility } : {}) };
    setBusy(true);
    setError(null);
    try {
      if (doc) await api(`/api/documents/${doc.id}`, { method: "PATCH", body: meta });
      else await uploadDocument(file!, { ...meta, visibility });
      await onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open title={doc ? de.documents.edit : de.documents.upload} onClose={onClose}>
      <form className="form todoform" onSubmit={save}>
        {!doc && (
          <div className="field">
            <label htmlFor={ids + "f"}>{de.documents.file}</label>
            <input id={ids + "f"} type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            <small>{de.documents.fileHint}</small>
          </div>
        )}
        <div className="field">
          <label htmlFor={ids + "n"}>{de.documents.name}</label>
          <input id={ids + "n"} value={name} maxLength={120} required autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={ids + "c"}>{de.documents.category}</label>
          <select id={ids + "c"} value={own ? "__own" : category} onChange={(e) => (e.target.value === "__own" ? (setOwn(true), setCategory("")) : (setOwn(false), setCategory(e.target.value)))}>
            <option value="">{de.documents.noCategory}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__own">{de.documents.ownCategory}</option>
          </select>
        </div>
        {own && (
          <div className="field">
            <label htmlFor={ids + "o"}>{de.documents.ownCategoryLabel}</label>
            <input id={ids + "o"} value={category} maxLength={40} autoComplete="off" onChange={(e) => setCategory(e.target.value)} />
          </div>
        )}
        <div className="row2">
          <div className="field">
            <label htmlFor={ids + "v"}>{de.documents.validUntil}</label>
            <input id={ids + "v"} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            <small>{de.documents.validHint}</small>
          </div>
          {validUntil && (
            <div className="field">
              <label htmlFor={ids + "r"}>{de.documents.remind}</label>
              <select id={ids + "r"} value={remindDays} onChange={(e) => setRemindDays(Number(e.target.value))}>
                {[7, 30, 90].map((n) => <option key={n} value={n}>{de.documents.remindDays[n]}</option>)}
              </select>
            </div>
          )}
        </div>
        {isCreator && (
          <button type="button" className="pill" onClick={() => setSheet(true)}>
            <Icon.Members className="ico" aria-hidden="true" />
            {de.visibility.see(visibilityLabel(visibility, members, me.id))}
          </button>
        )}
        {error && <Notice>{error}</Notice>}
        <div className="actions">
          <Button type="button" variant="ghost" onClick={onClose}>{de.members.cancel}</Button>
          <Button type="submit" disabled={busy}>{busy ? de.documents.uploading : de.members.save}</Button>
        </div>
      </form>
      <VisibilitySheet open={sheet} lead={name} value={visibility} members={members} meId={me.id} onClose={() => setSheet(false)} onSave={(v) => { setVisibility(v); setSheet(false); }} />
    </Dialog>
  );
}
