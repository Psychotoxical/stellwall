import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.ts";
import { Button, Notice } from "../components/ui.tsx";
import { Icon } from "../icons.ts";
import { de } from "../text/de.ts";
import { Header } from "./Home.tsx";
import { canPush, currentSubscription, isAppleMobile } from "../push-device.ts";

type Prefs = Record<string, boolean>;
type Device = { id: string; label: string; createdAt: string };
const KINDS = ["event", "event_reminder", "todo", "todo_reminder", "shopping", "birthday", "meal"] as const;
const PUSH_ID = "sw-push-id";

const isStandalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
const permission = () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

/** The browser's push key comes base64url-encoded; subscribe wants the raw bytes. */
function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android-Handy";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows-PC";
  return "Gerät";
}

/** Fixed steps in the order they are done: allow on this device, choose, try. */
export function Notifications() {
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: ["notify-prefs"], queryFn: () => api<Prefs>("/api/notification-prefs") });
  const devices = useQuery({ queryKey: ["push-devices"], queryFn: () => api<Device[]>("/api/push/subscriptions") });
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [perm, setPerm] = useState(permission());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const iphoneOutside = isAppleMobile() && !isStandalone();

  // A subscription the browser already has is registered again for whoever is signed in now:
  // on a shared tablet it moves to the new person, and a lost or renewed one is put right.
  useEffect(() => {
    void currentSubscription().then(async (s) => {
      if (!s) return setSubscribed(false);
      const json = s.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      try {
        const r = await api<{ id: string }>("/api/push/subscriptions", { method: "POST", body: { endpoint: json.endpoint, keys: json.keys, label: deviceLabel() } });
        localStorage.setItem(PUSH_ID, r.id);
        setSubscribed(true);
        void qc.invalidateQueries({ queryKey: ["push-devices"] });
      } catch {
        setSubscribed(false);
      }
    });
  }, [qc]);

  const refreshDevices = () => qc.invalidateQueries({ queryKey: ["push-devices"] });

  const allow = async () => {
    setBusy(true);
    setNote(null);
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") return;
      const { key } = await api<{ key: string }>("/api/push/key");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await api<{ id: string }>("/api/push/subscriptions", { method: "POST", body: { endpoint: json.endpoint, keys: json.keys, label: deviceLabel() } });
      localStorage.setItem(PUSH_ID, r.id);
      setSubscribed(true);
      await refreshDevices();
    } catch {
      setNote({ kind: "error", text: de.errors.generic });
    } finally {
      setBusy(false);
    }
  };

  const switchOff = async () => {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      await sub?.unsubscribe();
      const id = localStorage.getItem(PUSH_ID);
      if (id) await api(`/api/push/subscriptions/${id}`, { method: "DELETE" }).catch(() => {});
      localStorage.removeItem(PUSH_ID);
      setSubscribed(false);
      await refreshDevices();
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (kind: string, on: boolean) => {
    qc.setQueryData<Prefs>(["notify-prefs"], (p) => ({ ...(p ?? {}), [kind]: on }));
    try {
      await api("/api/notification-prefs", { method: "PUT", body: { [kind]: on } });
    } catch {
      setNote({ kind: "error", text: de.errors.generic });
      await qc.invalidateQueries({ queryKey: ["notify-prefs"] });
    }
  };

  const test = async () => {
    setNote(null);
    try {
      const r = await api<{ devices: number }>("/api/push/test", { method: "POST", body: {} });
      setNote({ kind: r.devices ? "ok" : "error", text: de.notify.tested(r.devices) });
    } catch {
      setNote({ kind: "error", text: de.errors.generic });
    }
  };

  const step1Done = subscribed === true;

  return (
    <div className="shop">
      <Header sub={de.nav.mehr} title={de.notify.title} />
      <ol className="steps">
        <li className={step1Done ? "past" : "now"}>
          <h2>{de.notify.step1}</h2>
          <div className="form">
            {iphoneOutside ? (
              <>
                <p className="found"><b>{de.notify.iphoneTitle}</b></p>
                <ol className="howto">{de.notify.iphoneSteps.map((s) => <li key={s}>{s}</li>)}</ol>
                <small className="hint">{de.notify.iphoneWhy}</small>
              </>
            ) : !canPush() ? (
              <Notice>{perm === "denied" ? de.notify.denied : de.notify.unsupported}</Notice>
            ) : perm === "denied" ? (
              <Notice>{de.notify.denied}</Notice>
            ) : step1Done ? (
              <>
                <Notice kind="ok">{de.notify.on}</Notice>
                <div className="actions" style={{ justifyContent: "flex-start" }}>
                  <Button type="button" variant="ghost" disabled={busy} onClick={switchOff}>{de.notify.off}</Button>
                </div>
              </>
            ) : (
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <Button type="button" disabled={busy || subscribed === null} onClick={allow}>{busy ? de.notify.allowing : de.notify.allow}</Button>
              </div>
            )}
          </div>
        </li>
        <li className={step1Done ? "now" : "later"}>
          <h2>{de.notify.step2}</h2>
          <div className="form">
            <div className="opts">
              {KINDS.map((k) => (
                <label key={k} className={"opt" + (prefs.data?.[k] !== false ? " on" : "")}>
                  <input type="checkbox" checked={prefs.data?.[k] !== false} disabled={!prefs.data} onChange={(e) => void toggle(k, e.target.checked)} />
                  <span><b>{de.notify.kinds[k]}</b>{de.notify.kindHints[k] && <small>{de.notify.kindHints[k]}</small>}</span>
                </label>
              ))}
            </div>
            <small className="hint">{de.notify.quiet}</small>
          </div>
        </li>
        <li className={step1Done ? "now" : "later"}>
          <h2>{de.notify.step3}</h2>
          <div className="form">
            {note && <Notice kind={note.kind}>{note.text}</Notice>}
            <div className="actions" style={{ justifyContent: "flex-start" }}>
              <Button type="button" variant={step1Done ? "primary" : "ghost"} onClick={test}>{de.notify.test}</Button>
            </div>
          </div>
        </li>
      </ol>
      <div className="sechead"><h2>{de.notify.devices}</h2></div>
      {devices.data && devices.data.length === 0 && <div className="box"><p className="empty">{de.notify.noDevices}</p></div>}
      {devices.data && devices.data.length > 0 && (
        <ul className="box staples">
          {devices.data.map((d) => (
            <li key={d.id} className="row" style={{ gridTemplateColumns: "1fr auto" }}>
              <span className="what">{d.label || "Gerät"}<small>{de.notify.since(new Date(d.createdAt).toLocaleDateString("de-DE"))}</small></span>
              <Button type="button" variant="ghost" className="btn-small" aria-label={de.notify.remove(d.label || "Gerät")} onClick={async () => { await api(`/api/push/subscriptions/${d.id}`, { method: "DELETE" }).catch(() => {}); await refreshDevices(); }}>
                <Icon.Trash className="ico" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
