import { useId, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api.ts";
import { Button, Notice } from "../components/ui.tsx";
import { de } from "../text/de.ts";
import { usePantry } from "../meals-api.ts";
import { Header } from "./Home.tsx";
import { Icon } from "../icons.ts";

export function Pantry() {
  const qc = useQueryClient();
  const list = usePantry();
  const ids = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["pantry"] });

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await api("/api/pantry", { method: "POST", body: { name: name.trim() } });
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? de.meals.stapleExists : de.errors.generic);
    }
  };

  return (
    <div className="shop">
      <Header sub={de.meals.page} title={de.meals.staples} />
      <p className="lead">{de.meals.staplesLead}</p>
      <form className="addbox" onSubmit={add}>
        <label htmlFor={ids + "n"}>{de.meals.stapleName}</label>
        <div className="addrow">
          <input id={ids + "n"} value={name} maxLength={80} autoComplete="off" onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim()}>{de.meals.stapleAdd}</Button>
        </div>
      </form>
      {error && <Notice>{error}</Notice>}
      <ul className="box staples">
        {(list.data ?? []).map((s) => (
          <li key={s.id} className="row" style={{ gridTemplateColumns: "1fr auto" }}>
            <span className="what">{s.name}{s.variants.length > 0 && <small>{s.variants.join(", ")}</small>}</span>
            <Button type="button" variant="ghost" className="btn-small" aria-label={de.meals.stapleRemove(s.name)} onClick={async () => { await api(`/api/pantry/${s.id}`, { method: "DELETE" }); await refresh(); }}><Icon.Trash className="ico" aria-hidden="true" /></Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
