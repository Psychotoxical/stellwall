import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { MemberDto } from "@stellwall/shared";
import { ApiError, api } from "../api.ts";
import { Button, Notice, TextField } from "../components/ui.tsx";
import { useSetMe } from "../session.ts";
import { de } from "../text/de.ts";
import { Wordmark } from "../components/Wordmark.tsx";

export function Setup() {
  const [form, setForm] = useState({ username: "", displayName: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setMe = useSetMe();
  const nav = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMe(await api<MemberDto>("/api/setup", { method: "POST", body: form }));
      nav("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? de.errors.invalidInput : de.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand"><Wordmark size={"lg"} /></div>
        <h1 className="title">{de.setup.title}</h1>
        <p className="lead">{de.setup.lead}</p>
        <TextField label={de.fields.username} autoComplete="username" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <TextField label={de.fields.displayName} autoComplete="name" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        <TextField label={de.fields.password} type="password" autoComplete="new-password" required minLength={10} hint={de.fields.passwordHint} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <Notice>{error}</Notice>}
        <Button type="submit" disabled={busy}>{de.setup.submit}</Button>
      </form>
    </div>
  );
}
