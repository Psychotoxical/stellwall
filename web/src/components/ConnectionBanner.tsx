import { useEffect, useState } from "react";
import { de } from "../text/de.ts";

export function ConnectionBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => {
    const off = () => setOffline(true);
    const on = () => setOffline(false);
    window.addEventListener("offline", off);
    window.addEventListener("stellwall:network-error", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("stellwall:network-error", off);
      window.removeEventListener("online", on);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="banner" role="status">
      {de.connection.offline}
    </div>
  );
}
