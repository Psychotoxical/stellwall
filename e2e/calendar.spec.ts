import { expect, test, type Browser } from "@playwright/test";
import { signInAlex, signInMember } from "./helpers.ts";

async function signedIn(browser: Browser, user: string) {
  const ctx = await browser.newContext({ baseURL: "http://localhost:5173", timezoneId: "Europe/Berlin" });
  const page = await ctx.newPage();
  await signInMember(page, user);
  return { ctx, page };
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

test("an event entered for someone shows up live, and a calendar file can be imported", async ({ browser }) => {
  const adminCtx = await browser.newContext({ baseURL: "http://localhost:5173", timezoneId: "Europe/Berlin" });
  const admin = await adminCtx.newPage();
  await signInAlex(admin);
  for (const [username, displayName] of [["csam", "Cora"], ["ckim", "Cleo"]] as const) {
    await admin.request.post("/api/members", {
      headers: { "x-stellwall": "1" },
      data: { username, displayName, password: "member-pass-1", role: "member", color: "person-peach" },
    });
  }
  const cora = await signedIn(browser, "csam");
  const cleo = await signedIn(browser, "ckim");

  // Cleo enters "Zahnarzt" for Cora.
  await cleo.page.goto("/kalender");
  await cleo.page.getByRole("button", { name: "Neuer Termin" }).click();
  const dialog = cleo.page.getByRole("dialog");
  await dialog.getByLabel("Was steht an?").fill("Zahnarzt");
  await dialog.locator("label.person", { hasText: "Cora" }).click();
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();

  // Cora sees it on her board without reloading, and the link opens the day in the calendar.
  const row = cora.page.getByRole("link", { name: /Cleo hat dir einen Termin eingetragen: Zahnarzt/ });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(cora.page).toHaveURL(/\/kalender\?tag=\d{4}-\d{2}-\d{2}/);
  await expect(cora.page.getByRole("region", { name: /^Heute, / }).getByText("Zahnarzt")).toBeVisible();

  // Cora imports a small calendar file.
  const start = new Date(Date.now() + 7 * 86_400_000);
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Example//Test//EN",
    "BEGIN:VEVENT", "UID:e2e-1@example.test", `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(new Date(start.getTime() + 3_600_000))}`, "SUMMARY:Elternabend", "END:VEVENT",
    "END:VCALENDAR", "",
  ].join("\r\n");
  await cora.page.goto("/kalender/import");
  await cora.page.getByLabel("Datei wählen (.ics)").setInputFiles({ name: "kalender.ics", mimeType: "text/calendar", buffer: Buffer.from(ics) });
  await cora.page.getByRole("button", { name: "Vorschau ansehen" }).click();
  await expect(cora.page.getByText("1 Termin gefunden")).toBeVisible();
  await expect(cora.page.getByText("Elternabend")).toBeVisible();
  await cora.page.getByRole("button", { name: "Importieren" }).click();
  await expect(cora.page.getByText("1 Termin importiert.")).toBeVisible();

  await adminCtx.close();
  await cora.ctx.close();
  await cleo.ctx.close();
});
