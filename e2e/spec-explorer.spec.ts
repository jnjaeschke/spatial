import { test, expect, type Page } from "@playwright/test";
import { makeRepo } from "../test/helpers/git-fixture.ts";
import { waitForCanvasSettled } from "./canvas.ts";

export async function exploreNavigate(page: Page) {
  const repo = makeRepo();
  repo.commit({ "a.txt": "a\n" }, "base");
  await page.goto(`http://127.0.0.1:4178/repo?path=${encodeURIComponent(repo.dir)}`);
  const box = page.getByLabel("start");
  await box.fill("/explore HTML#navigate");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);
  const navigate = page.getByTestId("spec-box-HTML#navigate");
  await expect(navigate).toBeVisible({ timeout: 15_000 });
  await waitForCanvasSettled(page);
  return navigate;
}

test("explore HTML#navigate from the start screen: a link opens a box with an edge, closing removes it", async ({ page }) => {
  const navigate = await exploreNavigate(page);
  await expect(navigate.locator('li[data-step="24.9.1"]')).toBeAttached();
  await navigate.locator('li[data-step="2"]').getByTestId("spec-link").first().click();
  const target = page.getByTestId("spec-box-HTML#snapshotting-source-snapshot-params");
  await expect(target).toBeVisible();
  await expect(page.locator(".react-flow__edge-text", { hasText: "step 2" })).toHaveCount(1);
  await target.getByRole("button", { name: "Close HTML#snapshotting-source-snapshot-params" }).click();
  await expect(target).toHaveCount(0);
  await expect(page.locator(".react-flow__edge-text", { hasText: "step 2" })).toHaveCount(0);
  await navigate.getByRole("button", { name: "Reopen 1 closed box" }).click();
  await expect(target).toBeVisible();
});
