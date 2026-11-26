import { useEffect, useState } from "react";
import { de } from "../text/de.ts";

/** Shows a bar once a new version is waiting; reloading switches to it. */
export function UpdateBanner() {
  const [reload, setReload] = useState<null | (() => void)>(null);
  useEffect(() => {
    const on = (e: Event) => setReload(() => (e as CustomEvent<() => void>).detail);
    window.addEventListener("stellwall:update", on);
    return () => window.removeEventListener("stellwall:update", on);
  }, []);
  if (!reload) return null;
  return (
    <div className="banner banner-update" role="status">
      <span>{de.update.ready}</span>
      <button type="button" className="btn btn-primary btn-small" onClick={() => reload()}>{de.update.reload}</button>
    </div>
  );
}
