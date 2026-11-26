import { expect, type Page } from "@playwright/test";

/** Signs Alex in, creating the first account when the server is still fresh. */
export async function signInAlex(page: Page) {
  await page.goto("/");
  const setup = page.getByRole("heading", { name: "Stellwall einrichten" });
  const login = page.getByRole("heading", { name: "Anmelden" });
  const home = page.getByRole("heading", { name: "Hallo Alex" });
  await expect(setup.or(login).or(home)).toBeVisible();
  if (await setup.isVisible()) {
    await page.getByLabel("Benutzername").fill("alex");
    await page.getByLabel("Anzeigename").fill("Alex");
    await page.getByLabel("Passwort").fill("correct-horse-1");
    await page.getByRole("button", { name: "Konto anlegen" }).click();
  } else if (await login.isVisible()) {
    await page.getByLabel("Benutzername").fill("alex");
    await page.getByLabel("Passwort").fill("correct-horse-1");
    await page.getByRole("button", { name: "Anmelden" }).click();
  }
  await expect(home).toBeVisible();
}
