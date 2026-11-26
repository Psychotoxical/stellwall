import { useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { MemberDto } from "@stellwall/shared";
import { api, ApiError } from "../api.ts";
import { Button, Dialog, Notice } from "../components/ui.tsx";
import { Icon } from "../icons.ts";
import { de } from "../text/de.ts";
import { useMembers } from "../shopping-api.ts";
import { addDays, parseYmd, todayYmd, weekStart } from "../calendar-api.ts";
import { recipeImage, useMeals, useRecipeSearch, type Meal, type RecipeRef, type ShopPreview } from "../meals-api.ts";
import { Header } from "./Home.tsx";

const errorText = (e: unknown, table: Record<string, string>) => (e instanceof ApiError ? (table[e.code] ?? de.errors.generic) : de.errors.generic);
/** A picture that does not load leaves no broken-image sign behind. */
const hideImage = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = "none"; };
const dayName = (d: string) => parseYmd(d).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "numeric" });

export function Meals() {
  const qc = useQueryClient();
  const members = useMembers().data ?? [];
  const [week, setWeek] = useState(() => weekStart(todayYmd()));
  const meals = useMeals(week);
  const [edit, setEdit] = useState<string | null>(null);
  const [shop, setShop] = useState<string[] | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const byDate = new Map((meals.data ?? []).map((m) => [m.date, m]));
  const today = todayYmd();
  const range = `${parseYmd(week).toLocaleDateString("de-DE", { day: "numeric", month: "short" })} – ${parseYmd(addDays(week, 6)).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}`;

  return (
    <div className="shop">
      <Header sub={de.meals.page} title={de.meals.title} />
      <div className="caltop">
        <span className="weekrange">{range}</span>
        <span className="calnav">
          <button type="button" className="iconbtn" aria-label={de.meals.prev} onClick={() => setWeek(addDays(week, -7))}><Chevron dir="left" /></button>
          <button type="button" className="pill" onClick={() => setWeek(weekStart(today))}>{de.meals.thisWeek}</button>
          <button type="button" className="iconbtn" aria-label={de.meals.next} onClick={() => setWeek(addDays(week, 7))}><Chevron dir="right" /></button>
        </span>
      </div>
      <ul className="box mealweek">
        {days.map((d) => {
          const m = byDate.get(d);
          const cook = m?.cookId ? members.find((x) => x.id === m.cookId) : null;
          return (
            <li key={d} className={"mealday" + (d === today ? " is-today" : "")}>
              <button type="button" className="mealday-main" onClick={() => setEdit(d)} aria-label={`${dayName(d)}, ${de.meals.lunch}: ${m ? (m.recipe?.name ?? m.text) : de.meals.nothing}`}>
                <span className="mday">{parseYmd(d).toLocaleDateString("de-DE", { weekday: "short" })}<small>{Number(d.slice(8))}.</small></span>
                {m?.recipe && <img className="mthumb" src={recipeImage(m.recipe.id)} alt="" loading="lazy" onError={hideImage} />}
                <span className="ctext">
                  <span className={"n" + (m ? "" : " soft")}>{m ? (m.recipe?.name ?? m.text) : de.meals.nothing}</span>
                  {cook && <small>{de.meals.cooks(cook.displayName)}</small>}
                </span>
              </button>
              {m?.recipe && (
                <Link className="iconbtn mealopen" to={`/essen/rezept/${m.recipe.slug}?portionen=${m.servings}&tag=${d}`} aria-label={`${de.meals.showRecipe}: ${m.recipe.name}`} title={de.meals.showRecipe}><Icon.Recipe className="ico" aria-hidden="true" /></Link>
              )}
            </li>
          );
        })}
      </ul>
      <div className="caltools" style={{ marginTop: 14 }}>
        <Button onClick={() => setShop(days)}>{de.meals.shopWeek}</Button>
        <Link to="/essen/grundvorrat" className="pill">{de.meals.staples}</Link>
      </div>
      {edit && (
        <MealSheet
          date={edit}
          meal={byDate.get(edit) ?? null}
          members={members}
          onClose={() => setEdit(null)}
          onDone={async () => {
            await qc.invalidateQueries({ queryKey: ["meals"] });
            setEdit(null);
          }}
        />
      )}
      {shop && <ShopSheet dates={shop} onClose={() => setShop(null)} />}
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

function MealSheet({ date, meal, members, onClose, onDone }: { date: string; meal: Meal | null; members: MemberDto[]; onClose: () => void; onDone: () => Promise<void> }) {
  const ids = useId();
  const [mode, setMode] = useState<"recipe" | "text">(meal && !meal.recipe ? "text" : "recipe");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recipe, setRecipe] = useState<RecipeRef | null>(meal?.recipe ?? null);
  const [text, setText] = useState(meal?.text ?? "");
  const [cookId, setCookId] = useState<string | null>(meal?.cookId ?? null);
  const [servings, setServings] = useState(meal?.servings ?? 4);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const search = useRecipeSearch(debounced, true);
  const mealieDown = search.error ? errorText(search.error, de.meals.errors) : null;
  const showText = mode === "text" || !!mealieDown;

  const save = async () => {
    setError(null);
    const useRecipe = !showText && recipe;
    if (!useRecipe && !text.trim()) return setError(de.errors.invalidInput);
    try {
      await api(`/api/meals/${date}`, { method: "PUT", body: useRecipe ? { recipe, text: null, cookId, servings } : { text: text.trim(), recipe: null, cookId, servings } });
      await onDone();
    } catch {
      setError(de.errors.generic);
    }
  };

  return (
    <Dialog open title={de.meals.plan(dayName(date))} onClose={onClose}>
      <div className="form todoform">
        <nav className="seg" aria-label={de.meals.lunch}>
          {(["recipe", "text"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={(m === "text") === showText} onClick={() => setMode(m)}>{de.meals.modes[m]}</button>
          ))}
        </nav>
        {mealieDown && <Notice>{mealieDown}</Notice>}
        {!showText && (
          <>
            <div className="field">
              <label htmlFor={ids + "q"}>{de.meals.search}</label>
              <input id={ids + "q"} type="search" value={q} autoComplete="off" enterKeyHint="search" onChange={(e) => setQ(e.target.value)} />
            </div>
            <ul className="recipes" aria-label={de.meals.results}>
              {(search.data ?? []).map((r) => (
                <li key={r.id}>
                  <button type="button" className={"recipe" + (recipe?.id === r.id ? " on" : "")} aria-pressed={recipe?.id === r.id} onClick={() => { setRecipe({ id: r.id, slug: r.slug, name: r.name }); setServings(meal?.recipe?.id === r.id ? servings : r.servings); }}>
                    {r.hasImage ? <img src={recipeImage(r.id)} alt="" loading="lazy" onError={hideImage} /> : <span className="noimg" aria-hidden="true"><Icon.Essensplan className="ico" /></span>}
                    <span>{r.name}</span>
                  </button>
                </li>
              ))}
              {search.data && search.data.length === 0 && <li className="empty">{de.meals.searchEmpty}</li>}
            </ul>
          </>
        )}
        {showText && (
          <div className="field">
            <label htmlFor={ids + "t"}>{de.meals.text}</label>
            <input id={ids + "t"} value={text} maxLength={120} autoComplete="off" onChange={(e) => setText(e.target.value)} />
            <small>{de.meals.textHint}</small>
          </div>
        )}
        <div className="row2">
          <div className="field">
            <label htmlFor={ids + "c"}>{de.meals.cook}</label>
            <select id={ids + "c"} value={cookId ?? ""} onChange={(e) => setCookId(e.target.value || null)}>
              <option value="">{de.meals.nobody}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
            </select>
          </div>
          <Servings value={servings} onChange={setServings} />
        </div>
        {error && <Notice>{error}</Notice>}
        <div className="actions">
          {meal && <Button type="button" variant="danger" onClick={async () => { await api(`/api/meals/${date}`, { method: "DELETE" }); await onDone(); }}>{de.meals.remove}</Button>}
          <Button type="button" variant="ghost" onClick={onClose}>{de.members.cancel}</Button>
          <Button type="button" onClick={save}>{de.members.save}</Button>
        </div>
      </div>
    </Dialog>
  );
}

export function Servings({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="field">
      <span className="legend" id="servings-l">{de.meals.servings}</span>
      <div className="stepper" role="group" aria-labelledby="servings-l">
        <button type="button" className="iconbtn" aria-label={de.meals.fewer} disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))}>−</button>
        <output aria-live="polite">{value}</output>
        <button type="button" className="iconbtn" aria-label={de.meals.more} disabled={value >= 50} onClick={() => onChange(Math.min(50, value + 1))}>+</button>
      </div>
    </div>
  );
}

/** Ingredients for the chosen days: what is needed ticked, the pantry asked about. */
export function ShopSheet({ dates, onClose }: { dates: string[]; onClose: () => void }) {
  const [preview, setPreview] = useState<ShopPreview | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ n: number; list: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ShopPreview>("/api/meals/shopping/preview", { method: "POST", body: { dates } })
      .then((p) => {
        setPreview(p);
        setPicked(new Set(p.special.map((l) => "s:" + l.food)));
      })
      .catch((e) => setError(errorText(e, de.meals.errors)));
  }, [dates]);

  const lines = preview ? [...preview.special.map((l) => ["s:" + l.food, l] as const), ...preview.pantry.map((l) => ["p:" + l.food, l] as const)].filter(([k]) => picked.has(k)).map(([, l]) => ({ food: l.food, quantity: l.quantity })) : [];
  const commit = async () => {
    setBusy(true);
    try {
      const r = await api<{ added: number; listName: string; listId: string }>("/api/meals/shopping/commit", { method: "POST", body: { lines } });
      setDone({ n: r.added, list: r.listName, id: r.listId });
    } catch (e) {
      setError(errorText(e, de.meals.errors));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (k: string) => {
    const next = new Set(picked);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setPicked(next);
  };
  const group = (title: string, hint: string | null, prefix: string, list: ShopPreview["special"]) =>
    list.length > 0 && (
      <fieldset className="field plain">
        <legend className="legend">{title}</legend>
        {hint && <small>{hint}</small>}
        <div className="opts">
          {list.map((l) => (
            <label key={l.food} className="person shopline">
              <input type="checkbox" checked={picked.has(prefix + l.food)} onChange={() => toggle(prefix + l.food)} />
              <span className="n">{l.food}</span>
              {l.display && <span className="q">{l.display}</span>}
            </label>
          ))}
        </div>
      </fieldset>
    );

  return (
    <Dialog open title={de.meals.shopTitle} onClose={onClose}>
      <div className="form todoform">
        {error && <Notice>{error}</Notice>}
        {done ? (
          <>
            <Notice kind="ok">{de.meals.done(done.n, done.list)}</Notice>
            <div className="actions">
              <Link className="btn btn-ghost btnlink" to={`/einkauf?liste=${done.id}`}>{de.meals.toList}</Link>
              <Button type="button" onClick={onClose}>{de.meals.finished}</Button>
            </div>
          </>
        ) : (
          preview && (
            <>
              {preview.missing.length > 0 && <Notice>{de.meals.missing(preview.missing.join(", "))}</Notice>}
              {preview.special.length + preview.pantry.length === 0 && <p className="empty">{de.meals.nothingToBuy}</p>}
              {group(de.meals.special, null, "s:", preview.special)}
              {group(de.meals.pantry, de.meals.pantryHint, "p:", preview.pantry)}
              <div className="actions">
                <Button type="button" variant="ghost" onClick={onClose}>{de.members.cancel}</Button>
                <Button type="button" disabled={busy || lines.length === 0} onClick={commit}>{de.meals.putOn(lines.length, preview.listName)}</Button>
              </div>
            </>
          )
        )}
      </div>
    </Dialog>
  );
}

