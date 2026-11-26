import { useEffect, useId, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api.ts";
import { Button, Notice } from "../components/ui.tsx";
import { de } from "../text/de.ts";
import { useLists } from "../shopping-api.ts";
import { useMealieSettings } from "../meals-api.ts";
import { Header } from "./Home.tsx";

/** The administration connects Mealie; the key is only ever sent, never shown. */
export function MealieSettings() {
  const qc = useQueryClient();
  const ids = useId();
  const s = useMealieSettings(true);
  const lists = useLists().data ?? [];
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [listId, setListId] = useState("");
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  useEffect(() => {
    if (s.data) {
      setUrl(s.data.url ?? "");
      setListId(s.data.listId ?? "");
    }
  }, [s.data]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setNote(null);
    try {
      await api("/api/settings/mealie", { method: "PUT", body: { url: url.trim(), listId: listId || null, ...(token.trim() ? { token: token.trim() } : {}) } });
      setToken("");
      await qc.invalidateQueries({ queryKey: ["mealie-settings"] });
      setNote({ kind: "ok", text: de.mealie.saved });
    } catch {
      setNote({ kind: "error", text: de.errors.invalidInput });
    }
  };
  const test = async () => {
    setNote(null);
    try {
      const r = await api<{ recipes: number }>("/api/settings/mealie/test", { method: "POST", body: {} });
      setNote({ kind: "ok", text: de.mealie.testOk(r.recipes) });
    } catch (e) {
      setNote({ kind: "error", text: e instanceof ApiError ? (de.meals.errors[e.code] ?? de.errors.generic) : de.errors.generic });
    }
  };

  return (
    <div className="shop">
      <Header sub={de.nav.mehr} title={de.mealie.page} />
      <p className="lead">{de.mealie.lead}</p>
      <form className="form" onSubmit={save}>
        <div className="field">
          <label htmlFor={ids + "u"}>{de.mealie.url}</label>
          <input id={ids + "u"} type="url" inputMode="url" value={url} required autoComplete="off" onChange={(e) => setUrl(e.target.value)} />
          <small>{de.mealie.urlHint}</small>
        </div>
        <div className="field">
          <label htmlFor={ids + "t"}>{de.mealie.token}</label>
          <input id={ids + "t"} type="password" value={token} autoComplete="off" onChange={(e) => setToken(e.target.value)} />
          <small>{s.data?.hasToken ? de.mealie.tokenSaved : de.mealie.tokenHint}</small>
        </div>
        <div className="field">
          <label htmlFor={ids + "l"}>{de.mealie.list}</label>
          <select id={ids + "l"} value={listId} onChange={(e) => setListId(e.target.value)}>
            <option value="">{de.mealie.listNone}</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        {note && <Notice kind={note.kind}>{note.text}</Notice>}
        <div className="actions" style={{ justifyContent: "flex-start" }}>
          <Button type="submit">{de.mealie.save}</Button>
          <Button type="button" variant="ghost" onClick={test}>{de.mealie.test}</Button>
        </div>
      </form>
    </div>
  );
}
