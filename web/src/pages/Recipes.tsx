import { useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api.ts";
import { Button, Dialog, Notice } from "../components/ui.tsx";
import { de } from "../text/de.ts";
import { recipeImage, useRecipeSearch, type RecipeSummary } from "../meals-api.ts";
import { Header } from "./Home.tsx";

/** Every recipe in Mealie, to look at, cook or shop for without planning it for a day. */
export function Recipes() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const list = useRecipeSearch(debounced, true);
  const [picked, setPicked] = useState<string[]>([]);
  // Categories that hold recipes, fullest first; "without" stands for recipes in none.
  const chips = useMemo(() => {
    const count = new Map<string, { name: string; n: number }>();
    for (const r of list.data ?? []) for (const c of r.categories ?? []) count.set(c.slug, { name: c.name, n: (count.get(c.slug)?.n ?? 0) + 1 });
    return [...count.entries()].sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name, "de")).map(([slug, v]) => ({ slug, name: v.name }));
  }, [list.data]);
  const anyWithout = (list.data ?? []).some((r) => !r.categories?.length);
  const flip = (slug: string) =>
    setPicked((p) => (slug === WITHOUT ? (p.includes(WITHOUT) ? [] : [WITHOUT]) : p.includes(slug) ? p.filter((x) => x !== slug) : [...p.filter((x) => x !== WITHOUT), slug]));
  const shown = (list.data ?? []).filter((r) =>
    picked.includes(WITHOUT) ? !r.categories?.length : picked.every((s) => r.categories?.some((c) => c.slug === s)),
  );
  const ids = useId();
  const code = list.error instanceof ApiError ? list.error.code : null;

  return (
    <div className="shop recipes">
      <Header sub={de.meals.page} title={de.meals.recipes} />
      <div className="caltools">
        <Button onClick={() => setAdding(true)}>{de.meals.addRecipe}</Button>
        <Link to="/essen" className="pill">{de.meals.page}</Link>
      </div>
      <div className="field">
        <label htmlFor={ids + "q"}>{de.meals.search}</label>
        <input id={ids + "q"} value={q} maxLength={100} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
      </div>
      {(chips.length > 0 || picked.length > 0) && (
        <div className="catchips" role="group" aria-label={de.meals.categoryFilter}>
          {chips.map((c) => (
            <button key={c.slug} type="button" className="catchip" aria-pressed={picked.includes(c.slug)} onClick={() => flip(c.slug)}>{c.name}</button>
          ))}
          {anyWithout && (
            <button type="button" className="catchip" aria-pressed={picked.includes(WITHOUT)} onClick={() => flip(WITHOUT)}>{de.meals.noCategory}</button>
          )}
        </div>
      )}
      {code && <Notice>{de.meals.errors[code] ?? de.errors.generic}</Notice>}
      {list.data && list.data.length === 0 && <p className="muted">{debounced ? de.meals.searchEmpty : de.meals.noRecipes}</p>}
      {list.data && list.data.length > 0 && shown.length === 0 && <p className="muted">{de.meals.categoryEmpty}</p>}
      {shown.length > 0 && (
        <ul className="box recipelist">
          {shown.map((r) => (
            <li key={r.id}>
              <Link to={`/essen/rezept/${r.slug}`}>
                {r.hasImage ? <img src={recipeImage(r.id)} alt="" loading="lazy" /> : <span className="noimg" aria-hidden="true" />}
                <span className="n">{r.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {adding && <AddRecipe onClose={() => setAdding(false)} />}
    </div>
  );
}

const WITHOUT = "(ohne)";

const MAX_SIDE = 2000;

/** A photo as JPEG of at most 2000 px a side, so the upload is quick; as it is where the browser cannot draw. */
async function photoData(file: File): Promise<{ data: string; type: string }> {
  const asIs = async () => ({ data: await toBase64(file), type: file.type || "image/jpeg" });
  if (typeof createImageBitmap !== "function") return asIs();
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    return blob ? { data: await toBase64(blob), type: "image/jpeg" } : asIs();
  } catch {
    return asIs();
  }
}

async function toBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

type Way = "photo" | "link" | "text";

/** A new recipe in Mealie: from photos (Mealie's AI reads them), a link, or typed in. */
function AddRecipe({ onClose }: { onClose: () => void }) {
  const [way, setWay] = useState<Way>("photo");
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const nav = useNavigate();
  const qc = useQueryClient();
  const ready = way === "photo" ? files.length > 0 : way === "link" ? /^https?:\/\/\S+$/.test(url.trim()) : text.trim().length > 0;

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = way === "photo" ? { images: await Promise.all(files.slice(0, 4).map(photoData)) } : way === "link" ? { url: url.trim() } : { text: text.trim() };
      const r = await api<RecipeSummary>("/api/recipes/import", { method: "POST", body });
      await qc.invalidateQueries({ queryKey: ["recipes"] });
      // Straight to choosing categories, so the new recipe does not end up in none by mistake.
      nav(`/essen/rezept/${r.slug}?kategorien=1`);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setError(de.meals.errors[code] ?? de.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open title={de.meals.addRecipe} onClose={onClose}>
      <div className="form">
        <nav className="seg" aria-label={de.meals.addFrom}>
          {(["photo", "link", "text"] as const).map((w) => (
            <button key={w} type="button" aria-pressed={way === w} onClick={() => setWay(w)}>{de.meals.addWays[w]}</button>
          ))}
        </nav>
        {way === "photo" && (
          <div className="field">
            <label htmlFor={ids + "f"}>{de.meals.photos}</label>
            <input id={ids + "f"} type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 4))} />
            <small>{de.meals.photosHint}</small>
          </div>
        )}
        {way === "link" && (
          <div className="field">
            <label htmlFor={ids + "u"}>{de.meals.link}</label>
            <input id={ids + "u"} type="url" inputMode="url" value={url} autoComplete="off" placeholder="https://" onChange={(e) => setUrl(e.target.value)} />
          </div>
        )}
        {way === "text" && (
          <div className="field">
            <label htmlFor={ids + "t"}>{de.meals.recipeText}</label>
            <textarea id={ids + "t"} rows={8} value={text} maxLength={20000} onChange={(e) => setText(e.target.value)} />
            <small>{de.meals.recipeTextHint}</small>
          </div>
        )}
        {busy && <p className="muted" role="status">{de.meals.importing}</p>}
        {error && <Notice>{error}</Notice>}
        <div className="actions">
          <Button type="button" variant="ghost" onClick={onClose}>{de.members.cancel}</Button>
          <Button type="button" disabled={!ready || busy} onClick={() => void go()}>{de.meals.importButton}</Button>
        </div>
      </div>
    </Dialog>
  );
}
