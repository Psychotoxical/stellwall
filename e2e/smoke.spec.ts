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
  await expect(page.getByRole("heading", { name: "Hallo Alex" })).toBeVisible();
  const list = page.locator(".areas");
  for (const a of areas) await expect(list.getByText(a)).toBeVisible();

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hallo Alex" })).toBeVisible();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(18, 21, 28)");
});
