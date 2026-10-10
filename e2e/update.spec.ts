import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { openChange, openPatch, startReview } from "./canvas.ts";

const repoDirs: string[] = [];

test.afterEach(() => {
  for (const dir of repoDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(dir: string, ...args: string[]) {
  return execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();
}

function writeLines(dir: string, values: string[]) {
  writeFileSync(join(dir, "a.txt"), `${values.join("\n")}\n`);
}

function amend(dir: string) {
  git(dir, "checkout", "feature");
  const lines = readFileSync(join(dir, "a.txt"), "utf8").trimEnd().split("\n");
  lines[29] = "30-edited";
  writeLines(dir, lines);
  writeFileSync(join(dir, "d.txt"), "d\n");
  git(dir, "add", "-A");
  git(dir, "commit", "--amend", "--no-edit");
}

async function openNarrated(page: Page, request: APIRequestContext) {
  const dir = mkdtempSync(join(tmpdir(), "spatial-update-"));
  repoDirs.push(dir);
  git(dir, "init", "-b", "main");
  writeLines(dir, Array.from({ length: 60 }, (_, i) => `line ${i + 1}`));
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "base");
  git(dir, "checkout", "-b", "feature");
  const featureLines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
  featureLines[29] = "THIRTY";
  writeLines(dir, featureLines);
  writeFileSync(join(dir, "c.txt"), "c\nROUTE-UPDATE-REVIEW\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "initial patch");

  await startReview(page, dir, "main..feature");
  await openPatch(page, 0);
  return { dir };
}

async function updateAndOpenInterdiff(page: Page) {
  const toast = page.getByTestId(/^toast-revision:/);
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await toast.getByRole("button", { name: "Update" }).click();
  await expect(page.getByTestId("epoch")).toHaveText("Epoch 2");
  await expect(page.getByTestId("change-c3")).toBeVisible({ timeout: 30_000 });
  await expect(toast).toHaveCount(0);
  await page.getByRole("button", { name: "Interdiff" }).click();
  return page.getByTestId("interdiff-panel");
}

test("author amends: toast, update, epoch 2, interdiff shows only the author's change", async ({ page, request }) => {
  const { dir } = await openNarrated(page, request);
  amend(dir);

  const panel = await updateAndOpenInterdiff(page);
  await expect(panel.locator("tr.add").filter({ hasText: "30-edited" })).toHaveCount(1);
  await expect(panel).toContainText("d.txt");
  await expect(panel.locator("tr.del").filter({ hasText: "THIRTY" })).toHaveCount(1);
  await expect(panel).not.toContainText("c.txt");
});

test("interdiff Back returns to the file opened from a hunk header", async ({ page, request }) => {
  const { dir } = await openNarrated(page, request);
  amend(dir);
  const toast = page.getByTestId(/^toast-revision:/);
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await toast.getByRole("button", { name: "Update" }).click();
  await expect(page.getByTestId("epoch")).toHaveText("Epoch 2");
  await expect(page.getByTestId("change-c3")).toBeVisible({ timeout: 30_000 });
  await openChange(page, "change-c1");
  await page.getByTestId(/^hunk-card-/).getByRole("button", { name: "a.txt" }).click();
  await expect(page.getByTestId("file-panel")).toBeVisible();
  await page.getByRole("button", { name: "Interdiff" }).click();
  await expect(page.getByTestId("interdiff-panel")).toBeVisible();
  await page.getByTestId("interdiff-panel").getByRole("button", { name: "Back" }).click();
  await expect(page.getByTestId("file-panel")).toBeVisible();
});

test("author rebases onto a moved base: interdiff excludes the base's own changes", async ({ page, request }) => {
  const { dir } = await openNarrated(page, request);
  git(dir, "checkout", "main");
  const mainLines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
  mainLines[4] = "FIVE";
  writeLines(dir, mainLines);
  writeFileSync(join(dir, "other.txt"), "base change\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "move base");
  git(dir, "checkout", "feature");
  git(dir, "rebase", "main");

  amend(dir);

  const panel = await updateAndOpenInterdiff(page);
  await expect(panel.locator("tr.add").filter({ hasText: "30-edited" })).toHaveCount(1);
  await expect(panel).not.toContainText("FIVE");
  await expect(panel).not.toContainText("other.txt");
  await expect(panel.locator("tr.del").filter({ hasText: "THIRTY" })).toHaveCount(1);
  await expect(panel.locator(".interdiff-conflicts")).toHaveCount(0);
});

test("second round: statuses, carried findings, verdict", async ({ page, request }) => {
  const { dir } = await openNarrated(page, request);
  const chip = (title: string) => page.getByTestId(/finding-chip/).filter({ hasText: title });
  const panel = page.getByTestId("finding-panel");
  await openChange(page, "change-c1");
  await expect(chip("Magic number")).toBeVisible({ timeout: 15_000 });
  await openChange(page, "change-c2");
  await expect(chip("Untested c")).toBeVisible();
  await chip("Untested c").click();
  await panel.getByLabel("Accept finding").click();
  await expect(panel.getByLabel("Dismiss finding")).toBeVisible();
  amend(dir);
  await page.getByTestId(/^toast-revision:/).getByRole("button", { name: "Update" }).click();
  await expect(page.getByTestId("epoch")).toHaveText("Epoch 2");
  await openPatch(page, 0);
  await expect(page.getByTestId("change-c3")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("summary").getByTestId("since-epoch")).toHaveText("Changes since epoch 1");
  await expect(page.getByTestId("change-c1").getByTestId("change-status")).toHaveText("modified");
  await expect(page.getByTestId("change-c2").getByTestId("change-status")).toHaveText("unchanged");
  await expect(page.getByTestId("change-c3").getByTestId("change-status")).toHaveText("new");
  const magic = page.getByTestId("summary").getByTestId(/finding-chip/).filter({ hasText: "Magic number" });
  await magic.click();
  await expect(panel.getByTestId("finding-outdated")).toBeVisible();
  await expect(panel.getByTestId("finding-epoch")).toHaveText("epoch 1");
  await openChange(page, "change-c2");
  await chip("Untested c").click();
  await expect(panel.getByTestId("finding-status")).toHaveText("addressed", { timeout: 30_000 });
  await expect(panel.getByTestId("finding-verdict")).toHaveText("Test coverage for c.txt was added.");
  await expect(panel.getByLabel("Comment")).toBeVisible();
  await page.reload();
  await openChange(page, "change-c2");
  await chip("Untested c").click();
  await expect(panel.getByTestId("finding-status")).toHaveText("addressed");
});
