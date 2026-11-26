import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { formatAmount, scaleIngredient } from "@stellwall/shared";
import { ApiError } from "../api.ts";
import { Button, Notice } from "../components/ui.tsx";
import { de } from "../text/de.ts";
import { recipeImage, useRecipe } from "../meals-api.ts";
import { Header } from "./Home.tsx";
import { Servings, ShopSheet } from "./Meals.tsx";

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

export function RecipeView() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const r = useRecipe(slug);
  const start = Number(params.get("portionen")) || 0;
  const [servings, setServings] = useState<number | null>(start > 0 ? start : null);
  const [shop, setShop] = useState(false);
  const date = params.get("tag");
  useWakeLock();

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
  const n = servings ?? r.data.servings;
  const factor = n / r.data.servings;

  return (
    <div className="shop recipeview">
      <Header sub={de.meals.page} title={r.data.name} />
      {r.data.hasImage && <img className="rhero" src={recipeImage(r.data.id)} alt="" />}
      <div className="caltools">
        <Servings value={n} onChange={setServings} />
      </div>
      <section aria-labelledby="ing-h">
        <div className="sechead"><h2 id="ing-h">{de.meals.ingredients}</h2></div>
        <ul className="box ings">
          {r.data.ingredients.map((i, k) => {
            const s = scaleIngredient(i, factor);
            const amount = [s.quantity === null ? "" : formatAmount(s.quantity), s.unit ?? ""].filter(Boolean).join(" ");
            return (
              <li key={k}>
                <span className="q">{amount}</span>
                <span className="n">{i.food}{i.note && <small>{i.note}</small>}</span>
              </li>
            );
          })}
        </ul>
        {date && (
          <div className="caltools" style={{ marginTop: 12 }}>
            <Button type="button" variant="ghost" onClick={() => setShop(true)}>{de.meals.shopRecipe}</Button>
          </div>
        )}
      </section>
      <section aria-labelledby="steps-h">
        <div className="sechead"><h2 id="steps-h">{de.meals.steps}</h2></div>
        <ol className="steps-cook">
          {r.data.steps.map((s, k) => <li key={k}>{s}</li>)}
        </ol>
        <p className="lead">{de.meals.awake}</p>
      </section>
      {shop && date && <ShopSheet dates={[date]} onClose={() => setShop(false)} />}
    </div>
  );
}
