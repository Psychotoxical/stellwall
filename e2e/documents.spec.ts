import { expect, test } from "@playwright/test";
import { signInAlex } from "./helpers.ts";

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

test("a document is uploaded, found, opened and deleted", async ({ page }) => {
  await signInAlex(page);
  await page.goto("/dokumente");
  await page.getByRole("button", { name: "Dokument hochladen" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Datei").setInputFiles({ name: "Kfz-Versicherung.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(dialog.getByLabel("Name")).toHaveValue("Kfz-Versicherung");
  await dialog.getByLabel("Kategorie").selectOption("Auto");
  // Choosing who may see it keeps the upload form open.
  await dialog.getByRole("button", { name: /^Sehen: / }).click();
  const who = page.getByRole("dialog", { name: "Wer darf das sehen?" });
  await who.getByText("Nur ich").click();
  await who.getByRole("button", { name: "Speichern" }).click();
  await expect(who).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Sehen: Nur ich" })).toBeVisible();
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("searchbox", { name: "Dokumente durchsuchen" }).fill("Versicherungen");
  await page.getByRole("link", { name: /Kfz-Versicherung/ }).click();
  await expect(page.getByRole("heading", { name: "Kfz-Versicherung" })).toBeVisible();
  const href = await page.getByRole("link", { name: "Herunterladen" }).getAttribute("href");
  const file = await page.request.get(href ?? "");
  expect(file.headers()["content-type"]).toBe("application/pdf");
  expect((await file.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByRole("button", { name: "Löschen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
  await expect(page).toHaveURL(/\/dokumente$/);
  await expect(page.getByRole("link", { name: /Kfz-Versicherung/ })).toHaveCount(0);
});
