import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, makeRepo } from "./repo.ts";
import { test, expect } from "@playwright/test";
import { openChange, startReview } from "./canvas.ts";

const dirs: string[] = [];
test.afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test("the file panel steps through the file's changes", async ({ page }) => {
  const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
  const dir = makeRepo("spatial-filenav-", { "FileNav.txt": `${lines.join("\n")}\n` });
  dirs.push(dir);
  const base = git(dir, "rev-parse", "HEAD");
  lines[19] = "TWENTY";
  lines[21] = "TWENTY-TWO";
  lines[149] = "ONE-FIFTY";
  writeFileSync(join(dir, "FileNav.txt"), `${lines.join("\n")}\n`);
  git(dir, "commit", "-am", "Edit two places");
  await startReview(page, dir, `${base}..HEAD`);
  await openChange(page);
  await page.getByTestId("hunk-f0h1").getByRole("button", { name: "FileNav.txt" }).click();

  const panel = page.getByTestId("file-panel");
  const position = panel.getByTestId("change-position");
  await expect(position).toHaveText("3/3");
  await expect(panel.getByRole("button", { name: "Next change" })).toBeDisabled();
  await panel.getByRole("button", { name: "Previous change" }).click();
  await expect(position).toHaveText("2/3");
  const twentyTwo = panel.locator("tr.focus", { hasText: "TWENTY-TWO" });
  await expect(twentyTwo).toBeInViewport();
  await page.keyboard.press("p");
  await expect(position).toHaveText("1/3");
  await expect(panel.locator("tr.focus").first()).toContainText("line 20");
  await expect(panel.getByRole("button", { name: "Previous change" })).toBeDisabled();
  await page.keyboard.press("n");
  await page.keyboard.press("n");
  await expect(position).toHaveText("3/3");
  await expect(panel.locator("tr.focus", { hasText: "ONE-FIFTY" })).toBeInViewport();
  await expect(panel.getByText("TWENTY", { exact: true })).not.toBeInViewport();
});
