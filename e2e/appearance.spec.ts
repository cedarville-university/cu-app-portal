import { expect, test } from "@playwright/test";

test("changes appearance in Settings and follows the device across the portal", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/settings");
  const root = page.locator("html");
  const appearance = page.getByRole("group", { name: "Appearance", exact: true });
  await expect(root).toHaveAttribute("data-theme", "dark");

  await expect(appearance.getByRole("radio", { name: "System" })).toBeChecked();
  await appearance.getByRole("radio", { name: "Light" }).check();
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(appearance.getByRole("radio", { name: "Light" })).toBeChecked();
  await expect(root).toHaveAttribute("data-theme", "light");

  await page.emulateMedia({ colorScheme: "light" });
  await appearance.getByRole("radio", { name: "Dark" }).check();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await appearance.getByRole("radio", { name: "System" }).check();
  await expect(root).toHaveAttribute("data-theme", "light");

  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Help" }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(appearance).toHaveCount(0);
  await expect(page.locator("header summary[aria-label='Appearance']")).toHaveCount(0);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveAttribute("data-theme", "light");
});
