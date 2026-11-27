import { expect, type Page } from "@playwright/test";

/** Signs Alex in, creating the first account when the server is still fresh. */
export async function signInAlex(page: Page) {
  await page.goto("/");
  const setup = page.getByRole("heading", { name: "Stellwall einrichten" });
  const login = page.getByRole("heading", { name: "Anmelden" });
  const home = page.getByRole("heading", { name: /^Gute[n]? \w+, Alex$/ });
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

/** Signs a member in with the password the administration chose, then picks an own one as the app asks. */
export async function signInMember(page: Page, user: string, password = "member-pass-1") {
  await page.goto("/anmelden");
  await page.getByLabel("Benutzername").fill(user);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  const first = page.getByRole("heading", { name: /bitte ein eigenes Passwort/ });
  const home = page.getByRole("heading", { name: /^Gute[n]? \w+, / });
  await expect(first.or(home)).toBeVisible();
  if (await first.isVisible()) {
    await page.getByLabel("Passwort von der Verwaltung").fill(password);
    await page.getByLabel("Neues Passwort").fill(password + "-own");
    await page.getByRole("button", { name: "Passwort speichern" }).click();
  }
  await expect(home).toBeVisible();
}
