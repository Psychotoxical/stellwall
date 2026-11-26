/** "stellwall" in round letters; its four l carry the four family colours. */
export function Wordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <span className={"wordmark wordmark-" + size} role="img" aria-label="Stellwall">
      <span aria-hidden="true">
        ste<span className="wl wl1">l</span><span className="wl wl2">l</span>wa<span className="wl wl3">l</span><span className="wl wl4">l</span>
      </span>
    </span>
  );
}
