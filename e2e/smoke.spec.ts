import { expect, test } from "@playwright/test";
import { signInAlex } from "./helpers.ts";

const areas = ["Dokumente", "Kalender", "Geburtstage", "Einkauf", "To-dos", "Essensplan"];

test("smoke: setup, logout, login, home in both themes", async ({ page }) => {
  await signInAlex(page);

  await page.goto("/konto");
  await page.getByRole("button", { name: "Auf diesem Gerät abmelden" }).click();
  await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();

  await page.getByLabel("Benutzername").fill(" Alex ");
  await page.getByLabel("Passwort").fill("correct-horse-1");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: /^Gute[n]? \w+, Alex$/ })).toBeVisible();
  const list = page.locator(".areas");
  for (const a of areas) await expect(list.getByText(a)).toBeVisible();

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByRole("heading", { name: /^Gute[n]? \w+, Alex$/ })).toBeVisible();
  // The ground follows the person's colour world; in dark mode it must be dark.
  const lightness = await page.evaluate(() => {
    const c = document.createElement("canvas").getContext("2d")!;
    c.fillStyle = getComputedStyle(document.body).backgroundColor;
    c.fillRect(0, 0, 1, 1);
    const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
    return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
  });
  expect(lightness).toBeLessThan(0.2);
});
