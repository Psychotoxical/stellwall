/**
 * A waiting new version, kept until the page can show it: the service worker may report it
 * before the signed-in pages are on screen.
 */
let pending: (() => void) | null = null;

export function offerUpdate(reload: () => void) {
  pending = reload;
  window.dispatchEvent(new CustomEvent("stellwall:update", { detail: reload }));
}

export const pendingUpdate = () => pending;
