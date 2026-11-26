/**
 * Phone browsers change the visible area all the time: the address bar slides away and the
 * keyboard covers the lower half. The visible height goes into CSS variables, so bottom sheets
 * always fit above the keyboard; a field with suggestions scrolls up so they stay in view.
 */
export function trackViewport() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const update = () => {
    if (!vv) return;
    root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
    // Where the browser does not shrink the page for the keyboard (Safari), lift sheets above it.
    root.style.setProperty("--kb", `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
  };
  vv?.addEventListener("resize", update);
  vv?.addEventListener("scroll", update);
  update();

  document.addEventListener("focusin", (e) => {
    const t = e.target as HTMLElement | null;
    if (!t?.matches?.("input, textarea") || !window.matchMedia("(pointer: coarse)").matches) return;
    // Sheets already sit near the top; only fields on the page itself need it.
    const box = t.closest("dialog") ? null : t.closest(".addbox");
    // Wait until the keyboard is up, then move the field to the top so its suggestions fit below.
    if (box) setTimeout(() => box.scrollIntoView({ block: "start", behavior: "smooth" }), 350);
  });
}
