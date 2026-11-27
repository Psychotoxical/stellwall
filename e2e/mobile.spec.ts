import { devices, expect, test, type Page } from "@playwright/test";
import { signInAlex } from "./helpers.ts";

// A narrow Android phone in a Chromium browser (like Brave), with touch.
test.use({ ...devices["Galaxy S9+"], baseURL: "http://localhost:5173", timezoneId: "Europe/Berlin" });

const sideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Scroll containers inside the open dialog that actually scroll. */
const scrollers = (p: Page) =>
  p.evaluate(() => {
    const d = [...document.querySelectorAll("dialog[open]")].at(-1)!;
    return [d, ...d.querySelectorAll("*")].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).length;
  });

async function saveVisible(p: Page) {
  const box = await p.getByRole("dialog").getByRole("button", { name: "Speichern" }).boundingBox();
  const vh = p.viewportSize()!.height;
  return !!box && box.y >= 0 && box.y + box.height <= vh;
}

test("phone: nothing scrolls sideways and every dialog can be saved without hunting for the button", async ({ page }) => {
  test.setTimeout(90_000);
  await signInAlex(page);
  const H = { "x-stellwall": "1" };
  for (const [username, displayName] of [["mobsam", "Samantha-Marie"], ["mobkim", "Johannes"]]) {
    await page.request.post("/api/members", { headers: H, data: { username, displayName, password: "member-pass-1", role: "member", color: "person-sky" } });
  }

  for (const path of ["/", "/einkauf", "/todos", "/kalender", "/kalender/geburtstage", "/kalender/import", "/mehr", "/konto", "/mitglieder", "/essen", "/essen/grundvorrat", "/dokumente", "/mealie", "/benachrichtigungen"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await sideways(page), path).toBe(0);
  }

  for (const [path, button] of [["/kalender", "Neuer Termin"], ["/todos", "Neues To-do"], ["/kalender/geburtstage", "Neuer Geburtstag"]] as const) {
    await page.goto(path);
    await page.getByRole("button", { name: button }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await sideways(page), button).toBe(0);
    expect(await scrollers(page), button + ": one scroll area").toBeLessThanOrEqual(1);
    expect(await saveVisible(page), button + ": save visible").toBe(true);
    // With the keyboard open the screen is much shorter; saving must still be in reach.
    await page.setViewportSize({ width: 320, height: 380 });
    expect(await saveVisible(page), button + ": save visible with keyboard").toBe(true);
    await page.setViewportSize({ width: 320, height: 658 });
    await page.keyboard.press("Escape");
  }

  // The lunch sheet of the meal plan, without Mealie set up.
  await page.goto("/essen");
  await page.locator(".mealday-main").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await sideways(page), "meal").toBe(0);
  expect(await scrollers(page), "meal: one scroll area").toBeLessThanOrEqual(1);
  expect(await saveVisible(page), "meal: save visible").toBe(true);
});
