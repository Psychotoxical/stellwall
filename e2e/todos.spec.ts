import { expect, test, type Browser } from "@playwright/test";
import { signInAlex } from "./helpers.ts";

async function signedIn(browser: Browser, user: string) {
  const ctx = await browser.newContext({ baseURL: "http://localhost:5173" });
  const page = await ctx.newPage();
  await page.goto("/anmelden");
  await page.getByLabel("Benutzername").fill(user);
  await page.getByLabel("Passwort").fill("member-pass-1");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByRole("heading", { name: /^Hallo/ })).toBeVisible();
  return { ctx, page };
}

test("a to-do given to someone shows up live and its check is seen by everyone", async ({ browser }) => {
  const adminCtx = await browser.newContext({ baseURL: "http://localhost:5173" });
  const admin = await adminCtx.newPage();
  await signInAlex(admin);
  for (const [username, displayName] of [["tsam", "Tara"], ["tkim", "Kai"]] as const) {
    await admin.request.post("/api/members", {
      headers: { "x-stellwall": "1" },
      data: { username, displayName, password: "member-pass-1", role: "member", color: "person-sky" },
    });
  }

  const tara = await signedIn(browser, "tsam");
  const kai = await signedIn(browser, "tkim");

  // Kai gives Tara a to-do for today that needs confirming.
  await kai.page.goto("/todos");
  await kai.page.getByRole("button", { name: "Neues To-do" }).click();
  const dialog = kai.page.getByRole("dialog");
  await dialog.getByLabel("Was ist zu tun?").fill("Pflanzen gießen");
  await dialog.locator("label.person", { hasText: "Tara" }).click();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
  await dialog.getByLabel("Datum").fill(today);
  await dialog.getByText("Muss bestätigt werden").click();
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();

  // Tara sees it on her board and under "Heute für dich" without reloading.
  await expect(tara.page.getByRole("link", { name: /Kai hat dir „Pflanzen gießen“ gegeben/ })).toBeVisible({ timeout: 10_000 });
  await tara.page.getByRole("checkbox", { name: "Pflanzen gießen abhaken" }).click();

  // Kai sees who did it.
  await kai.page.getByRole("button", { name: "Alle" }).click();
  await expect(kai.page.getByText("Tara hat erledigt")).toBeVisible({ timeout: 10_000 });

  await adminCtx.close();
  await tara.ctx.close();
  await kai.ctx.close();
});
