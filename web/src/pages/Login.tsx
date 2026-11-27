import { useState, type FormEvent } from "react";
import { keepSignInPassword } from "../signInPassword.ts";
import { useNavigate } from "react-router";
import type { MemberDto } from "@stellwall/shared";
import { ApiError, api } from "../api.ts";
import { Button, Notice, TextField } from "../components/ui.tsx";
import { useSetMe } from "../session.ts";
import { de } from "../text/de.ts";
import { Wordmark } from "../components/Wordmark.tsx";

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setMe = useSetMe();
  const nav = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await api<MemberDto>("/api/auth/login", { method: "POST", body: { username, password } });
      // Someone with a password from the administration picks an own one next; that page uses this one.
      if (me.mustChangePassword) keepSignInPassword(password);
      setMe(me);
      nav("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "locked" && typeof err.data.until === "string") {
        const time = new Date(err.data.until).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        setError(de.login.locked(time));
      } else if (err instanceof ApiError && err.status === 401) setError(de.login.invalid);
      else setError(de.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand"><Wordmark size={"lg"} /></div>
        <h1 className="title">{de.login.title}</h1>
        <TextField label={de.fields.username} autoComplete="username" autoCapitalize="none" required value={username} onChange={(e) => setUsername(e.target.value)} />
        <TextField label={de.fields.password} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Notice>{error}</Notice>}
        <Button type="submit" disabled={busy}>{de.login.submit}</Button>
      </form>
    </div>
  );
}
