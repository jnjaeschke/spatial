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

test("expand context around a hunk", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  for (let i = 0; i < 20 && (await page.getByTestId("change-c1").getAttribute("data-level")) !== "code"; i++) {
    await page.getByRole("button", { name: "zoom in" }).click();
    await page.waitForTimeout(150);
  }
  const hunk = page.getByTestId("hunk-f0h0");
  await expect(hunk.getByText("line 27", { exact: true })).toBeAttached();
  await expect(hunk.getByText("line 26", { exact: true })).toHaveCount(0);
  await hunk.getByRole("button", { name: "↑ 20 lines" }).click();
  await expect(hunk.getByText("line 7", { exact: true })).toBeAttached();
  await expect(hunk.getByText("line 6", { exact: true })).toHaveCount(0);
  await hunk.getByRole("button", { name: "↑ 20 lines" }).click();
  await expect(hunk.getByText("line 1", { exact: true })).toBeAttached();
  await expect(hunk.getByRole("button", { name: "↑ 20 lines" })).toHaveCount(0);
  await hunk.getByRole("button", { name: "↓ 20 lines" }).focus();
  await page.keyboard.press("Enter");
  await expect(hunk.getByText("line 53", { exact: true })).toBeAttached();
  await expect(hunk.getByText("line 54", { exact: true })).toHaveCount(0);
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

test("open the whole file in the side panel", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  for (let i = 0; i < 20 && (await page.getByTestId("change-c1").getAttribute("data-level")) !== "code"; i++) {
    await page.getByRole("button", { name: "zoom in" }).click();
    await page.waitForTimeout(150);
  }
  await page.getByTestId("hunk-f0h0").getByRole("button", { name: "a.txt" }).click();
  const panel = page.getByTestId("file-panel");
  await expect(panel.getByText("line 1", { exact: true })).toBeAttached();
  await expect(panel.getByText("line 60", { exact: true })).toBeAttached();
  await expect(panel.getByText("THIRTY", { exact: true })).toBeInViewport();
  await panel.getByRole("button", { name: "Close file" }).click();
  await expect(panel).toHaveCount(0);
});
