import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, user: string, password: string) {
  await page.goto("/anmelden");
  await page.getByLabel("Benutzername").fill(user);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: /^Hallo/ })).toBeVisible();
}

test("live shopping between two people", async ({ browser }) => {
  const alexCtx = await browser.newContext({ baseURL: "http://localhost:5173" });
  const alex = await alexCtx.newPage();
  await alex.goto("/");
  if (await alex.getByRole("heading", { name: "Stellwall einrichten" }).isVisible().catch(() => false)) {
    await alex.getByLabel("Benutzername").fill("alex");
    await alex.getByLabel("Anzeigename").fill("Alex");
    await alex.getByLabel("Passwort").fill("correct-horse-1");
    await alex.getByRole("button", { name: "Konto anlegen" }).click();
  } else {
    await login(alex, "alex", "correct-horse-1");
  }
  await expect(alex.getByRole("heading", { name: "Hallo Alex" })).toBeVisible();

  // Alex adds Sam.
  await alex.goto("/mitglieder");
  await alex.getByRole("button", { name: "Mitglied hinzufügen" }).click();
  const dialog = alex.getByRole("dialog");
  await dialog.getByLabel("Benutzername").fill("sam");
  await dialog.getByLabel("Anzeigename").fill("Sam");
  await dialog.getByLabel("Passwort").fill("member-pass-1");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(alex.getByText("sam · Mitglied")).toBeVisible();

  // Alex watches the start page, Sam adds two things on another device.
  await alex.goto("/");
  const samCtx = await browser.newContext({ baseURL: "http://localhost:5173" });
  const sam = await samCtx.newPage();
  await login(sam, "sam", "member-pass-1");
  await sam.goto("/einkauf");
  const input = sam.getByLabel("Was fehlt?");
  await input.fill("zwiebel");
  await expect(sam.getByRole("option", { name: /^Zwiebeln/ })).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(sam.getByRole("region", { name: "Obst & Gemüse" }).getByText("Zwiebeln")).toBeVisible();
  await input.fill("Milch");
  await input.press("Enter");
  await expect(sam.getByText("Milch", { exact: true })).toBeVisible();

  // Without reloading, Alex sees it on the board and opens the list.
  const row = alex.getByRole("link", { name: /Sam hat 2 Sachen auf „Einkauf“ gesetzt/ });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  const milk = alex.getByText("Milch", { exact: true });
  await expect(milk).toBeVisible();
  await expect(alex.locator(".item.is-new")).toHaveCount(2);

  // Alex checks the milk; Sam sees it checked without reloading.
  await alex.getByRole("checkbox", { name: "Milch abhaken" }).click();
  await expect(sam.getByRole("region", { name: "Heute abgehakt" }).getByText("Alex hat abgehakt")).toBeVisible({ timeout: 10_000 });

  await alexCtx.close();
  await samCtx.close();
});
