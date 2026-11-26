import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MemberDto, PersonColor } from "@stellwall/shared";
import { ApiError, api } from "../api.ts";
import { ColorPicker } from "../components/ColorPicker.tsx";
import { Button, Notice, TextField } from "../components/ui.tsx";
import { useMe, useSetMe } from "../session.ts";
import { de } from "../text/de.ts";
import { readTheme, saveTheme, type ThemeChoice } from "../theme/theme.ts";
import { Header } from "./Home.tsx";
import { currentSubscription } from "../push-device.ts";

type SessionRow = { id: string; userAgent: string | null; lastSeenAt: string; current: boolean };

function deviceName(ua: string | null): string {
  if (!ua) return "Unbekanntes Gerät";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Gerät";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${browser} auf ${os}`;
}

export function Account() {
  const me = useMe().data!;
  const setMe = useSetMe();
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<SessionRow[]>("/api/me/sessions") });
  const [profile, setProfile] = useState({ displayName: me.displayName, color: me.color as PersonColor });
  const [profileMsg, setProfileMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwMsg, setPwMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [theme, setTheme] = useState<ThemeChoice>(readTheme());

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    try {
      setMe(await api<MemberDto>("/api/members/" + me.id, { method: "PATCH", body: profile }));
      setProfileMsg({ kind: "ok", text: de.account.saved });
    } catch {
      setProfileMsg({ kind: "error", text: de.errors.generic });
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/me/password", { method: "POST", body: pw });
      setPw({ current: "", next: "" });
      setPwMsg({ kind: "ok", text: de.account.passwordChanged });
    } catch (err) {
      setPwMsg({ kind: "error", text: err instanceof ApiError && err.status === 401 ? de.account.wrongPassword : de.errors.invalidInput });
    }
  }

  async function endSession(id: string) {
    await api("/api/me/sessions/" + id, { method: "DELETE" });
    await qc.invalidateQueries({ queryKey: ["sessions"] });
  }

  async function logout() {
    // This device stops getting this person's messages.
    const sub = await currentSubscription();
    await api("/api/auth/logout", { method: "POST", body: sub ? { pushEndpoint: sub.endpoint } : {} });
    setMe(null);
  }

  return (
    <>
      <Header title={de.account.title} />
      <div className="cols">
        <div>
          <div className="sechead"><h2>{de.account.profile}</h2></div>
          <form className="form" onSubmit={saveProfile}>
            <TextField label={de.fields.displayName} required value={profile.displayName} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} />
            <ColorPicker value={profile.color} onChange={(color) => setProfile({ ...profile, color })} />
            {profileMsg && <Notice kind={profileMsg.kind}>{profileMsg.text}</Notice>}
            <div className="actions" style={{ justifyContent: "flex-start" }}><Button type="submit">{de.members.save}</Button></div>
          </form>

          <div className="sechead"><h2>{de.account.password}</h2></div>
          <form className="form" onSubmit={savePassword}>
            <TextField label={de.fields.currentPassword} type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            <TextField label={de.fields.newPassword} type="password" autoComplete="new-password" required minLength={10} hint={de.fields.passwordHint} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            {pwMsg && <Notice kind={pwMsg.kind}>{pwMsg.text}</Notice>}
            <div className="actions" style={{ justifyContent: "flex-start" }}><Button type="submit">{de.account.password}</Button></div>
          </form>
        </div>
        <div>
          <div className="sechead"><h2>{de.account.theme}</h2></div>
          <div className="seg" role="radiogroup" aria-label={de.account.theme}>
            {(["system", "light", "dark"] as const).map((t) => (
              <label key={t}>
                <input type="radio" name="theme" value={t} checked={theme === t} onChange={() => { setTheme(t); saveTheme(t); }} />
                {de.account.themes[t]}
              </label>
            ))}
          </div>

          <div className="sechead"><h2>{de.account.devices}</h2></div>
          <div className="box">
            {sessions.data?.map((s) => (
              <div key={s.id} className="row" style={{ gridTemplateColumns: "1fr auto" }}>
                <span className="what">
                  {deviceName(s.userAgent)}
                  <small>{s.current ? de.account.thisDevice : new Date(s.lastSeenAt).toLocaleDateString("de-DE")}</small>
                </span>
                {!s.current && <Button variant="ghost" className="btn-small" onClick={() => endSession(s.id)}>{de.account.logoutDevice}</Button>}
              </div>
            ))}
          </div>
          <div className="actions" style={{ justifyContent: "flex-start", marginTop: 14 }}>
            <Button variant="ghost" onClick={logout}>{de.account.logout}</Button>
          </div>
        </div>
      </div>
    </>
  );
}
