import { useState, type FormEvent } from "react";
import type { MemberDto } from "@stellwall/shared";
import { ApiError, api } from "../api.ts";
import { Button, Notice, TextField } from "../components/ui.tsx";
import { useSetMe } from "../session.ts";
import { de } from "../text/de.ts";
import { Wordmark } from "../components/Wordmark.tsx";
import { forgetSignInPassword, signInPassword } from "../signInPassword.ts";

/** After the first sign-in with a password the administration chose, the member picks an own one. */
export function FirstPassword({ me }: { me: MemberDto }) {
  // Right after signing in the old password is known; after a reload it is asked for.
  const [known, setKnown] = useState(signInPassword());
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setMe = useSetMe();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/me/password", { method: "POST", body: { current: known ?? current, next } });
      forgetSignInPassword();
      setMe({ ...me, mustChangePassword: false });
    } catch (err) {
      const wrong = err instanceof ApiError && err.status === 401;
      // A kept password that no longer fits (changed elsewhere meanwhile): ask for it after all.
      if (wrong) { forgetSignInPassword(); setKnown(null); }
      setError(wrong ? de.firstPassword.wrong : de.errors.invalidInput);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    forgetSignInPassword();
    await api("/api/auth/logout", { method: "POST", body: {} });
    setMe(null);
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand"><Wordmark size={"lg"} /></div>
        <h1 className="title">{de.firstPassword.title(me.displayName)}</h1>
        <p>{de.firstPassword.lead}</p>
        {known === null && <TextField label={de.firstPassword.current} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />}
        <TextField label={de.fields.newPassword} type="password" autoComplete="new-password" required minLength={10} hint={de.fields.passwordHint} value={next} onChange={(e) => setNext(e.target.value)} />
        {error && <Notice>{error}</Notice>}
        <Button type="submit" disabled={busy}>{de.firstPassword.submit}</Button>
        <Button type="button" variant="ghost" onClick={logout}>{de.account.logout}</Button>
      </form>
    </div>
  );
}
