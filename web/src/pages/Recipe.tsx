import { useEffect, useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import { formatAmount, inlineMarks, scaleIngredient } from "@stellwall/shared";
import { api, ApiError } from "../api.ts";
import { Button, Dialog, Notice } from "../components/ui.tsx";
import { de } from "../text/de.ts";
import { recipeImage, useCategories, useRecipe, type Recipe } from "../meals-api.ts";
import { Header } from "./Home.tsx";
import { Servings, ShopSheet, dayName } from "./Meals.tsx";

/** Keeps the screen on while cooking; browsers without it simply skip this. */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let stopped = false;
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    const take = () => {
      if (!wl || document.visibilityState !== "visible") return;
      wl.request("screen").then((l) => { if (stopped) void l.release(); else lock = l; }).catch(() => {});
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", take);
      void lock?.release().catch(() => {});
    };
  }, []);
}

type Marks = { i: number[]; s: number[]; at: number };
const MARK_PREFIX = "sw-cook:";
const WEEK = 7 * 86_400_000;

/** What the cook already did, kept on this device per recipe and day; a week later it is gone. */
function useCookMarks(slug: string, day: string) {
  const key = MARK_PREFIX + slug + ":" + day;
  const [marks, setMarks] = useState<Marks>(() => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (!k.startsWith(MARK_PREFIX)) continue;
        const old = JSON.parse(localStorage.getItem(k) ?? "{}") as Partial<Marks>;
        if (!old.at || Date.now() - old.at > WEEK) localStorage.removeItem(k);
      }
      const m = JSON.parse(localStorage.getItem(key) ?? "null") as Marks | null;
      return m ?? { i: [], s: [], at: Date.now() };
    } catch {
      return { i: [], s: [], at: Date.now() };
    }
  });
  const flip = (part: "i" | "s", n: number) => {
    const next = { ...marks, [part]: marks[part].includes(n) ? marks[part].filter((x) => x !== n) : [...marks[part], n], at: Date.now() };
    setMarks(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* private mode: the marks simply do not stay */
    }
  };
  return { marks, flip };
}

export function RecipeView() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const r = useRecipe(slug);
  const start = Number(params.get("portionen")) || 0;
  const [servings, setServings] = useState<number | null>(start > 0 ? start : null);
  const [shop, setShop] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [planned, setPlanned] = useState<string | null>(null);
  const date = params.get("tag");
  const sorting = params.get("kategorien") === "1";
  const setSorting = (on: boolean) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (on) next.set("kategorien", "1");
        else next.delete("kategorien");
        return next;
      },
      { replace: true },
    );
  useWakeLock();
  const { marks, flip } = useCookMarks(slug ?? "", date ?? new Date().toISOString().slice(0, 10));

  if (r.error) {
    const code = r.error instanceof ApiError ? r.error.code : "";
    return (
      <div className="shop">
        <Header sub={de.meals.page} title={de.meals.showRecipe} />
        <Notice>{de.meals.errors[code] ?? de.errors.generic}</Notice>
        <p><Link to="/essen">{de.meals.page}</Link></p>
      </div>
    );
  }
  if (!r.data) return null;
  // Without servings in Mealie (a baking sheet) the amounts stay as written.
  const fixed = r.data.servingsKnown === false;
  const n = fixed ? r.data.servings : servings ?? r.data.servings;
  const factor = n / r.data.servings;

  return (
    <div className="shop recipeview">
      <Header sub={de.meals.page} title={r.data.name} />
      {r.data.hasImage && <img className="rhero" src={recipeImage(r.data.id)} alt="" />}
      <div className="caltools">
        {fixed ? <span className="pill quiet">{de.meals.asWritten}</span> : <Servings value={n} onChange={setServings} />}
        <Button type="button" variant="ghost" onClick={() => setPlanning(true)}>{de.meals.planRecipe}</Button>
        <Button type="button" variant="ghost" onClick={() => setSorting(true)}>{de.meals.categories}</Button>
      </div>
      {(r.data.categories?.length ?? 0) > 0 && (
        <p className="catline">{r.data.categories!.map((c) => c.name).join(", ")}</p>
      )}
      {planned && <p className="muted" role="status">{planned}</p>}
      <section aria-labelledby="ing-h">
        <div className="sechead"><h2 id="ing-h">{de.meals.ingredients}</h2></div>
        <ul className="box ings">
          {r.data.ingredients.map((i, k) => {
            const s = scaleIngredient(i, factor);
            const amount = [s.quantity === null ? "" : formatAmount(s.quantity), s.unit ?? ""].filter(Boolean).join(" ");
            return (
              <li key={k}>
                <button type="button" className="tick" aria-pressed={marks.i.includes(k)} onClick={() => flip("i", k)}>
                  <span className="q">{amount}</span>
                  <span className="n">{i.food}{i.note && <small>{i.note}</small>}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="caltools" style={{ marginTop: 12 }}>
          <Button type="button" variant="ghost" onClick={() => setShop(true)}>{de.meals.shopRecipe}</Button>
        </div>
      </section>
      <section aria-labelledby="steps-h">
        <div className="sechead"><h2 id="steps-h">{de.meals.steps}</h2></div>
        <ol className="steps-cook">
          {r.data.steps.map((s, k) => (
            <li key={k}>
              <button type="button" className="tick" aria-pressed={marks.s.includes(k)} onClick={() => flip("s", k)}><Step text={s} /></button>
            </li>
          ))}
        </ol>
        <p className="lead">{de.meals.awake}</p>
      </section>
      {shop && (date ? <ShopSheet dates={[date]} servings={n} onClose={() => setShop(false)} /> : <ShopSheet dates={[]} recipe={{ slug: r.data.slug, servings: n }} onClose={() => setShop(false)} />)}
      {sorting && <CategoryDialog recipe={r.data} onClose={() => setSorting(false)} />}
      {planning && (
        <PlanDialog
          onClose={() => setPlanning(false)}
          onPlan={async (day) => {
            await api(`/api/meals/${day}`, { method: "PUT", body: { recipe: { id: r.data!.id, slug: r.data!.slug, name: r.data!.name }, text: null, cookId: null, servings: n } });
            setPlanning(false);
            setPlanned(de.meals.planned(dayName(day)));
          }}
        />
      )}
    </div>
  );
}

/** The recipe's categories in Mealie: every category as a chip, the current ones on. */
function CategoryDialog({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const all = useCategories();
  const [on, setOn] = useState<string[]>(() => (recipe.categories ?? []).map((c) => c.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await api<Recipe>(`/api/recipes/${recipe.slug}/categories`, { method: "PUT", body: { ids: on } });
      qc.setQueryData(["recipe", recipe.slug], next);
      await qc.invalidateQueries({ queryKey: ["recipes"] });
      onClose();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setError(de.meals.errors[code] ?? de.errors.generic);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open title={de.meals.categoriesTitle} onClose={onClose}>
      <div className="form">
        <p className="muted">{de.meals.categoriesHint}</p>
        {all.data && all.data.length === 0 && <p className="muted">{de.meals.categoriesNone}</p>}
        {all.error && <Notice>{de.errors.generic}</Notice>}
        <div className="catchips" role="group" aria-label={de.meals.categoriesTitle}>
          {(all.data ?? []).map((c) => (
            <button key={c.id} type="button" className="catchip" aria-pressed={on.includes(c.id)} onClick={() => setOn((o) => (o.includes(c.id) ? o.filter((x) => x !== c.id) : [...o, c.id]))}>
              {c.name}
            </button>
          ))}
        </div>
        {error && <Notice>{error}</Notice>}
        <div className="actions">
          <Button type="button" variant="ghost" onClick={onClose}>{de.members.cancel}</Button>
          <Button type="button" disabled={busy || !all.data} onClick={() => void save()}>{de.members.save}</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Which day the recipe goes on; today is picked first. */
function PlanDialog({ onClose, onPlan }: { onClose: () => void; onPlan: (day: string) => Promise<void> }) {
  const [day, setDay] = useState(() => new Date().toLocaleDateString("sv-SE"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  return (
    <Dialog open title={de.meals.planRecipe} onClose={onClose}>
      <div className="form">
        <div className="field">
          <label htmlFor={ids + "d"}>{de.meals.planFor}</label>
          <input id={ids + "d"} type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        {error && <Notice>{error}</Notice>}
        <div className="actions">
          <Button type="button" variant="ghost" onClick={onClose}>{de.members.cancel}</Button>
          <Button
            type="button"
            disabled={!day || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onPlan(day);
              } catch {
                setError(de.errors.generic);
              } finally {
                setBusy(false);
              }
            }}
          >
            {de.meals.planRecipe}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** A step as Mealie writes it: **bold** and *italic* shown, the stars not. */
function Step({ text }: { text: string }) {
  return (
    <>
      {inlineMarks(text).map((m, i) => {
        const t = m.italic ? <em>{m.text}</em> : m.text;
        return m.bold ? <strong key={i}>{t}</strong> : <span key={i}>{t}</span>;
      })}
    </>
  );
}
