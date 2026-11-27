import { expect, test } from "@playwright/test";
import { signInAlex } from "./helpers.ts";
import { TOKEN } from "../server/test/fake-mealie.ts";

test("a recipe goes into the week and its ingredients onto the shopping list", async ({ page }) => {
  await signInAlex(page);
  const H = { "x-stellwall": "1" };
  const list = await (await page.request.post("/api/lists", { headers: H, data: { name: "Essenseinkauf", visibility: { everyone: false, memberIds: [] } } })).json();

  // The administration connects Mealie and picks the list.
  await page.goto("/mealie");
  await page.getByLabel("Adresse von Mealie").fill("http://127.0.0.1:8090");
  await page.getByLabel("API-Schlüssel").fill(TOKEN);
  await page.getByLabel("Einkaufsliste für die Zutaten").selectOption({ label: "Essenseinkauf" });
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Verbindung testen" }).click();
  await expect(page.getByText(/Verbindung steht/)).toBeVisible();

  // Today's lunch becomes the vegetable pan.
  await page.goto("/essen");
  await page.locator(".mealday.is-today .mealday-main").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Rezept suchen").fill("pfanne");
  // A tap on the recipe plans it and closes the sheet.
  await dialog.getByRole("button", { name: /Gemüsepfanne/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".mealday.is-today")).toContainText("Gemüsepfanne");

  // The recipe opens with its steps.
  await page.getByRole("link", { name: "Rezept ansehen: Gemüsepfanne" }).click();
  await expect(page.getByText("Reis kochen.")).toBeVisible();
  await page.goBack();

  // Shopping for the week: Paprika is ticked, the pantry is asked about.
  await page.getByRole("button", { name: "Zutaten der Woche einkaufen" }).click();
  const shop = page.getByRole("dialog");
  await expect(shop.getByRole("checkbox", { name: /Paprika/ })).toBeChecked();
  await expect(shop.getByRole("checkbox", { name: /Reis/ })).not.toBeChecked();
  await shop.getByRole("button", { name: "1 Sache auf „Essenseinkauf“ setzen" }).click();
  await expect(shop.getByText("1 Sache steht jetzt auf „Essenseinkauf“.")).toBeVisible();

  const items = await (await page.request.get(`/api/lists/${list.id}/items`)).json();
  expect(items.map((i: { name: string; quantity: string }) => [i.name, i.quantity])).toEqual([["Paprika", "2×"]]);
});
