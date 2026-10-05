import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("pick session, narrate, see canvas and activity", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await expect(page.getByText("No narrative yet")).toBeVisible();
  await page.getByRole("button", { name: "Narrate" }).click();
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("task-narrate")).toHaveAttribute("data-status", "succeeded");
  await expect(page.getByText("Edits a and adds c.")).toBeVisible();
});

test("failed narrate shows the error in the activity strip and keeps the canvas", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await page.getByLabel("base").fill("HEAD");
  await page.getByLabel("head").fill("HEAD~1");
  await page.getByRole("button", { name: "Narrate" }).click();
  await expect(page.getByTestId("task-importDiff").first()).toHaveAttribute("data-status", "failed", { timeout: 10_000 });
  await expect(page.getByText(/is not an ancestor of/)).toBeVisible();
});
