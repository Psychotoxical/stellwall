import { useId } from "react";
import { PERSON_COLORS, type PersonColor } from "@stellwall/shared";
import { de } from "../text/de.ts";

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: PersonColor) => void }) {
  const name = useId();
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="legend">{de.fields.color}</legend>
      <div className="swatches">
        {PERSON_COLORS.map((c) => (
          <label key={c} className="swatch">
            <input type="radio" name={name} value={c} checked={value === c} onChange={() => onChange(c)} />
            <span className="dot" style={{ background: `var(--${c})` }} />
            {de.colors[c]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
