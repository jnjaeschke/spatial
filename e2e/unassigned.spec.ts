import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, makeRepo } from "./repo.ts";
import { test, expect } from "@playwright/test";
import { openChange, startReview } from "./canvas.ts";

const dirs: string[] = [];
test.afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test("a hunk the narration left out is reachable from an Unassigned changes card", async ({ page }) => {
  const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
  const dir = makeRepo("spatial-unassigned-", { "Unassigned.txt": `${lines.join("\n")}\n` });
  dirs.push(dir);
  const base = git(dir, "rev-parse", "HEAD");
  lines[19] = "TWENTY";
  lines[149] = "ONE-FIFTY";
  writeFileSync(join(dir, "Unassigned.txt"), `${lines.join("\n")}\n`);
  git(dir, "commit", "-am", "Edit two places");
  await startReview(page, dir, `${base}..HEAD`);
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  const card = page.getByTestId("change-unassigned-C1");
  await expect(card).toContainText("Unassigned changes");
  await expect(page.getByTestId("hunk-card-f0h1")).toHaveCount(0);

  await card.getByLabel("Reviewed unassigned-C1").click();
  await expect(card.getByLabel("Reviewed unassigned-C1")).toBeChecked();
  await page.reload();
  await expect(page.getByTestId("change-unassigned-C1").getByLabel("Reviewed unassigned-C1")).toBeChecked();

  await openChange(page, "change-unassigned-C1");
  await expect(page.getByTestId("hunk-card-f0h1")).toContainText("ONE-FIFTY");
  await expect(page.getByTestId("hunk-card-f0h0")).toHaveCount(0);
});
