import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MemberDto, PersonColor, Role } from "@stellwall/shared";
import { ApiError, api } from "../api.ts";
import { ColorPicker } from "../components/ColorPicker.tsx";
import { Button, Dialog, Notice, PersonChip, TextField } from "../components/ui.tsx";
import { useMe } from "../session.ts";
import { de } from "../text/de.ts";
import { Header } from "./Home.tsx";

type Mode = { kind: "add" } | { kind: "edit" | "reset" | "remove"; member: MemberDto } | null;

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "username_taken") return de.members.taken;
    if (e.code === "last_admin") return de.members.lastAdmin;
    if (e.status === 400) return de.errors.invalidInput;
  }
  return de.errors.generic;
}

export function Members() {
  const me = useMe().data!;
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["members"], queryFn: () => api<MemberDto[]>("/api/members") });
  const [mode, setMode] = useState<Mode>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const close = () => setMode(null);
  const done = async (msg?: string) => {
    await qc.invalidateQueries({ queryKey: ["members"] });
    await qc.invalidateQueries({ queryKey: ["me"] });
    setNotice(msg ?? null);
    close();
  };

  return (
    <>
      <Header title={de.members.title} />
      <div className="actions" style={{ justifyContent: "flex-start", marginBottom: 14 }}>
        <Button onClick={() => { setNotice(null); setMode({ kind: "add" }); }}>{de.members.add}</Button>
      </div>
      {notice && <Notice kind="ok">{notice}</Notice>}
      <div className="box" style={{ marginTop: 12 }}>
        {list.data?.map((m) => (
          <div key={m.id} className="row row-member">
            <PersonChip name={m.displayName} color={m.color} />
            <span className="what">
              {m.displayName}
              <small>{m.username} · {de.roles[m.role]}{m.id === me.id ? " · du" : ""}</small>
            </span>
            <span className="row-actions">
              <Button variant="ghost" className="btn-small" aria-label={de.members.edit + " " + m.displayName} onClick={() => setMode({ kind: "edit", member: m })}>{de.members.edit}</Button>
              <Button variant="ghost" className="btn-small" aria-label={de.members.resetPassword + " " + m.displayName} onClick={() => setMode({ kind: "reset", member: m })}>{de.members.resetPassword}</Button>
              <Button variant="danger" className="btn-small" aria-label={de.members.remove + " " + m.displayName} onClick={() => setMode({ kind: "remove", member: m })}>{de.members.remove}</Button>
            </span>
          </div>
        ))}
      </div>

      <Dialog open={mode?.kind === "add"} title={de.members.add} onClose={close}>
        {mode?.kind === "add" && <AddForm onDone={() => done()} onCancel={close} />}
      </Dialog>
      <Dialog open={mode?.kind === "edit"} title={de.members.edit} onClose={close}>
        {mode?.kind === "edit" && <EditForm member={mode.member} onDone={() => done(de.account.saved)} onCancel={close} />}
      </Dialog>
      <Dialog open={mode?.kind === "reset"} title={de.members.resetPassword} onClose={close}>
        {mode?.kind === "reset" && <ResetForm member={mode.member} onDone={() => done(de.members.resetDone)} onCancel={close} />}
      </Dialog>
      <Dialog open={mode?.kind === "remove"} title={mode?.kind === "remove" ? de.members.removeConfirm(mode.member.displayName) : ""} onClose={close}>
        {mode?.kind === "remove" && <RemoveForm member={mode.member} onDone={() => done()} onCancel={close} />}
      </Dialog>
    </>
  );
}

type FormProps = { onDone: () => void; onCancel: () => void };

function useSubmit(run: () => Promise<unknown>, onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await run();
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, submit };
}

function AddForm({ onDone, onCancel }: FormProps) {
  const [f, setF] = useState({ username: "", displayName: "", password: "", role: "member" as Role, color: "person-lilac" as PersonColor });
  const s = useSubmit(() => api("/api/members", { method: "POST", body: f }), onDone);
  return (
    <form className="form" onSubmit={s.submit}>
      <TextField label={de.fields.username} autoCapitalize="none" required value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
      <TextField label={de.fields.displayName} required value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
      <TextField label={de.fields.password} type="password" autoComplete="new-password" required minLength={10} hint={de.fields.passwordHint} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      <RoleSelect value={f.role} onChange={(role) => setF({ ...f, role })} />
      <ColorPicker value={f.color} onChange={(color) => setF({ ...f, color })} />
      {s.error && <Notice>{s.error}</Notice>}
      <div className="actions">
        <Button type="button" variant="ghost" onClick={onCancel}>{de.members.cancel}</Button>
        <Button type="submit" disabled={s.busy}>{de.members.save}</Button>
      </div>
    </form>
  );
}

function EditForm({ member, onDone, onCancel }: FormProps & { member: MemberDto }) {
  const [f, setF] = useState({ displayName: member.displayName, role: member.role, color: member.color as PersonColor });
  const s = useSubmit(() => api("/api/members/" + member.id, { method: "PATCH", body: f }), onDone);
  return (
    <form className="form" onSubmit={s.submit}>
      <TextField label={de.fields.displayName} required value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
      <RoleSelect value={f.role} onChange={(role) => setF({ ...f, role })} />
      <ColorPicker value={f.color} onChange={(color) => setF({ ...f, color })} />
      {s.error && <Notice>{s.error}</Notice>}
      <div className="actions">
        <Button type="button" variant="ghost" onClick={onCancel}>{de.members.cancel}</Button>
        <Button type="submit" disabled={s.busy}>{de.members.save}</Button>
      </div>
    </form>
  );
}

function ResetForm({ member, onDone, onCancel }: FormProps & { member: MemberDto }) {
  const [password, setPassword] = useState("");
  const s = useSubmit(() => api(`/api/members/${member.id}/reset-password`, { method: "POST", body: { password } }), onDone);
  return (
    <form className="form" onSubmit={s.submit}>
      <p>{member.displayName}</p>
      <TextField label={de.fields.newPassword} type="password" autoComplete="new-password" required minLength={10} hint={de.fields.passwordHint} value={password} onChange={(e) => setPassword(e.target.value)} />
      {s.error && <Notice>{s.error}</Notice>}
      <div className="actions">
        <Button type="button" variant="ghost" onClick={onCancel}>{de.members.cancel}</Button>
        <Button type="submit" disabled={s.busy}>{de.members.save}</Button>
      </div>
    </form>
  );
}

function RemoveForm({ member, onDone, onCancel }: FormProps & { member: MemberDto }) {
  const s = useSubmit(() => api("/api/members/" + member.id, { method: "DELETE" }), onDone);
  return (
    <form className="form" onSubmit={s.submit}>
      <p>{de.members.removeLead(member.displayName)}</p>
      {s.error && <Notice>{s.error}</Notice>}
      <div className="actions">
        <Button type="button" variant="ghost" onClick={onCancel}>{de.members.cancel}</Button>
        <Button type="submit" variant="danger" disabled={s.busy}>{de.members.removeAction(member.displayName)}</Button>
      </div>
    </form>
  );
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div className="field">
      <label htmlFor="role-select">{de.fields.role}</label>
      <select id="role-select" value={value} onChange={(e) => onChange(e.target.value as Role)}>
        <option value="member">{de.roles.member}</option>
        <option value="admin">{de.roles.admin}</option>
      </select>
    </div>
  );
}
