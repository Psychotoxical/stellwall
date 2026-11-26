import { useId, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api.ts";
import { Button, Notice } from "../components/ui.tsx";
import { VisibilitySheet, visibilityLabel } from "../components/VisibilitySheet.tsx";
import { Icon } from "../icons.ts";
import { useMe } from "../session.ts";
import { de } from "../text/de.ts";
import { useMembers, type Visibility } from "../shopping-api.ts";
import { parseYmd, type ImportPreview } from "../calendar-api.ts";
import { Header } from "./Home.tsx";

const MAX_BYTES = 5 * 1024 * 1024;
const longDate = (s: string) => parseYmd(s).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
const errorText = (e: unknown) => (e instanceof ApiError ? (de.import.errors[e.code] ?? de.errors.generic) : de.errors.generic);

/** Three fixed steps: pick a file or link, check the preview, see the result. */
export function Import() {
  const me = useMe().data!;
  const members = useMembers().data ?? [];
  const qc = useQueryClient();
  const ids = useId();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [from, setFrom] = useState<"today" | "all">("today");
  const [visibility, setVisibility] = useState<Visibility>({ everyone: false, memberIds: [me.id] });
  const [sheet, setSheet] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = result ? 3 : preview ? 2 : 1;

  const load = async () => {
    setError(null);
    if (file && file.size > MAX_BYTES) return setError(de.import.errors.too_big!);
    setBusy(true);
    try {
      const body = file ? { ics: await file.text() } : { url: url.trim() };
      setPreview(await api<ImportPreview>("/api/import/preview", { method: "POST", body }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setError(null);
    setBusy(true);
    try {
      setResult(await api("/api/import/commit", { method: "POST", body: { token: preview!.token, from, visibility } }));
      await qc.invalidateQueries({ queryKey: ["calendar"] });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setPreview(null);
        setError(de.import.errors.expired!);
      } else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setUrl("");
    setPreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="shop">
      <Header sub={de.calendar.page} title={de.import.page} />
      <p className="lead">{de.import.lead}</p>
      <ol className="steps">
        <li className={step === 1 ? "now" : "past"}>
          <h2>{de.import.step1}</h2>
          {step === 1 && (
            <div className="form">
              <div className="field">
                <label htmlFor={ids + "f"}>{de.import.file}</label>
                <input id={ids + "f"} type="file" accept=".ics,text/calendar" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setUrl(""); setError(null); }} />
                <small>{de.import.fileHint}</small>
              </div>
              <p className="or">{de.import.or}</p>
              <div className="field">
                <label htmlFor={ids + "u"}>{de.import.url}</label>
                <input id={ids + "u"} type="url" inputMode="url" value={url} autoComplete="off" placeholder="webcal://…" onChange={(e) => { setUrl(e.target.value); setFile(null); setError(null); }} />
                <small>{de.import.urlHint}</small>
              </div>
              {error && <Notice>{error}</Notice>}
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <Button type="button" disabled={busy || (!file && !url.trim())} onClick={load}>{busy ? de.import.loading : de.import.preview}</Button>
              </div>
            </div>
          )}
        </li>
        <li className={step === 2 ? "now" : step > 2 ? "past" : "later"}>
          <h2>{de.import.step2}</h2>
          {step === 2 && preview && (
            <div className="form">
              <p className="found"><b>{de.import.found(preview.count)}</b> {de.import.period(longDate(preview.first), longDate(preview.last))}</p>
              {preview.sample.length > 0 && (
                <ul className="box callist">
                  {preview.sample.map((s, n) => (
                    <li key={n} className="calrow">
                      <span className="calrow-main">
                        <span className="ctime">{parseYmd(s.date).toLocaleDateString("de-DE", { day: "numeric", month: "numeric" })}</span>
                        <span className="ctext"><span className="n">{s.title}</span>{s.series && <small>{de.import.series}</small>}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <fieldset className="field plain">
                <legend className="legend">{de.import.which}</legend>
                <div className="opts">
                  <label className={"opt" + (from === "today" ? " on" : "")}>
                    <input type="radio" name={ids + "w"} checked={from === "today"} onChange={() => setFrom("today")} />
                    <span><b>{de.import.fromToday(preview.fromToday)}</b><small>{de.import.fromTodaySub}</small></span>
                  </label>
                  <label className={"opt" + (from === "all" ? " on" : "")}>
                    <input type="radio" name={ids + "w"} checked={from === "all"} onChange={() => setFrom("all")} />
                    <span><b>{de.import.everything(preview.count)}</b><small>{de.import.everythingSub}</small></span>
                  </label>
                </div>
              </fieldset>
              <button type="button" className="pill" onClick={() => setSheet(true)}>
                <Icon.Members className="ico" aria-hidden="true" />
                {de.visibility.see(visibilityLabel(visibility, members, me.id))}
              </button>
              {error && <Notice>{error}</Notice>}
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <Button type="button" disabled={busy} onClick={commit}>{busy ? de.import.importing : de.import.doImport}</Button>
                <Button type="button" variant="ghost" onClick={reset}>{de.members.cancel}</Button>
              </div>
            </div>
          )}
        </li>
        <li className={step === 3 ? "now" : "later"}>
          <h2>{de.import.step3}</h2>
          {result && (
            <div className="form">
              <Notice kind="ok">
                {de.import.done(result.added)}
                {result.skipped > 0 && " " + de.import.skipped(result.skipped)}
              </Notice>
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <Link to="/kalender" className="btn btn-primary btnlink">{de.import.toCalendar}</Link>
                <Button type="button" variant="ghost" onClick={reset}>{de.import.again}</Button>
              </div>
            </div>
          )}
        </li>
      </ol>
      <VisibilitySheet open={sheet} lead={de.import.page} value={visibility} members={members} meId={me.id} onClose={() => setSheet(false)} onSave={(v) => { setVisibility(v); setSheet(false); }} />
    </div>
  );
}
