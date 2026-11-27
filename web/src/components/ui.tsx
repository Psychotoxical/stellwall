import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" };

export function Button({ variant = "primary", className, ...rest }: ButtonProps) {
  return <button {...rest} className={["btn", "btn-" + variant, className].filter(Boolean).join(" ")} />;
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null };

export function TextField({ label, hint, error, id, ...rest }: FieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = [hint ? fid + "-hint" : null, error ? fid + "-err" : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <input id={fid} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      {hint && <small id={fid + "-hint"}>{hint}</small>}
      {error && (
        <small id={fid + "-err"} className="field-error">
          {error}
        </small>
      )}
    </div>
  );
}

export function Notice({ kind = "error", children }: { kind?: "error" | "ok"; children: ReactNode }) {
  return (
    <p className={"notice notice-" + kind} role={kind === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

type DialogProps = { open: boolean; title: string; onClose: () => void; children: ReactNode };

/** Native modal dialog: bottom sheet on phones, centred on wide screens. */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const tid = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    }
    if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={tid}
      // React passes these events up to every dialog around this one; only our own counts,
      // or closing "Wer darf das sehen?" would close the form it sits in.
      // Closing it from here (open became false) fires "close" a moment later too; by then the next
      // dialog may be open, and passing that on would shut it at once ("Liste leeren" from the tools).
      onClose={(e) => {
        if (e.target === e.currentTarget && open) onClose();
      }}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <h2 id={tid}>{title}</h2>
          {children}
        </>
      )}
    </dialog>
  );
}

export function PersonChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="chip" style={{ background: `var(--${color})` }} title={name}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
