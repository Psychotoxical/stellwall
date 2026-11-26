import type { World } from "@stellwall/shared";

const KEY = "sw-world";

/** Gives the whole app the person's colour world; remembered on the device for the first paint. */
export function applyWorld(world: World) {
  document.documentElement.setAttribute("data-world", world);
  try {
    localStorage.setItem(KEY, world);
  } catch {
    /* private mode: the world still applies for this visit */
  }
}
