import { useEffect, useId, useState } from "react";
import type { MemberDto } from "@stellwall/shared";
import { Button, Dialog, Notice, PersonChip } from "./ui.tsx";
import { de } from "../text/de.ts";
import type { Visibility } from "../shopping-api.ts";

type Mode = "all" | "me" | "some";

const modeOf = (v: Visibility, meId: string): Mode =>
  v.everyone ? "all" : v.memberIds.every((id) => id === meId) ? "me" : "some";

type Props = {
  open: boolean;
  lead: string;
  value: Visibility;
  members: MemberDto[];
  meId: string;
  onSave: (v: Visibility) => void | Promise<void>;
  onClose: () => void;
};

/** "Who may see this?" for any item; the current member always stays included. */
export function VisibilitySheet({ open, lead, value, members, meId, onSave, onClose }: Props) {
  const name = useId();
  const [mode, setMode] = useState<Mode>(modeOf(value, meId));
  const [picked, setPicked] = useState<Set<string>>(new Set([...value.memberIds, meId]));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setMode(modeOf(value, meId));
      setPicked(new Set([...value.memberIds, meId]));
      setError(null);
    }
  }, [open, value, meId]);

  const save = async () => {
    if (mode === "some" && [...picked].filter((id) => id !== meId).length === 0) {
      setError(de.visibility.pickSomeone);
      return;
    }
    await onSave(
      mode === "all" ? { everyone: true, memberIds: [] } : mode === "me" ? { everyone: false, memberIds: [meId] } : { everyone: false, memberIds: [...picked] },
    );
  };

  const option = (m: Mode, title: string, sub: string) => (
    <label className={"opt" + (mode === m ? " on" : "")}>
      <input type="radio" name={name} checked={mode === m} onChange={() => setMode(m)} />
      <span>
        <b>{title}</b>
        <small>{sub}</small>
      </span>
    </label>
  );

  return (
    <Dialog open={open} title={de.visibility.title} onClose={onClose}>
      <p>{lead}</p>
      <div className="opts">
        {option("all", de.visibility.all, de.visibility.allSub)}
        {option("me", de.visibility.me, de.visibility.meSub)}
        {option("some", de.visibility.some, de.visibility.someSub)}
      </div>
      {mode === "some" && (
        <div className="people">
          {members.map((m) => (
            <label key={m.id} className="person">
              <input
                type="checkbox"
                checked={picked.has(m.id)}
                disabled={m.id === meId}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(m.id);
                  else next.delete(m.id);
                  setPicked(next);
                  setError(null);
                }}
              />
              <PersonChip name={m.displayName} color={m.color} />
              {m.displayName}
              {m.id === meId ? " " + de.visibility.you : ""}
            </label>
          ))}
        </div>
      )}
      {error && <Notice>{error}</Notice>}
      <div className="actions">
        <Button type="button" variant="ghost" onClick={onClose}>
          {de.members.cancel}
        </Button>
        <Button type="button" onClick={save}>
          {de.members.save}
        </Button>
      </div>
    </Dialog>
  );
}

export function visibilityLabel(v: Visibility, members: MemberDto[], meId: string): string {
  if (v.everyone) return de.visibility.all;
  if (v.memberIds.every((id) => id === meId)) return de.visibility.me;
  return v.memberIds.map((id) => members.find((m) => m.id === id)?.displayName ?? "?").join(", ");
}
