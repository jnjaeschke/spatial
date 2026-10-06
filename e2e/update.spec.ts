import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

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
  writeFileSync(join(dir, "c.txt"), "c\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "initial patch");

  const title = `update-${crypto.randomUUID()}`;
  const response = await request.post("http://127.0.0.1:4178/api/sessions", { data: { repo: dir, title } });
  expect(response.ok()).toBeTruthy();
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: title }).click();
  await page.getByLabel("base").fill("main");
  await page.getByLabel("head").fill("feature");
  await page.getByRole("button", { name: "Narrate" }).click();
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  return { dir };
}

async function updateAndOpenInterdiff(page: Page) {
  const toast = page.getByTestId(/^toast-revision:/);
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await toast.getByRole("button", { name: "Update" }).click();
  await expect(page.getByTestId("epoch")).toHaveText("Epoch 2");
  await expect(page.getByText(/has no narrative yet/)).toBeVisible();
  await expect(page.getByTestId("change-c1")).toHaveCount(0);
  await expect(toast).toHaveCount(0);
  await page.getByRole("button", { name: "Interdiff" }).click();
  return page.getByTestId("interdiff-panel");
}

test("author amends: toast, update, epoch 2, interdiff shows only the author's change", async ({ page, request }) => {
  const { dir } = await openNarrated(page, request);
  const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
  lines[29] = "THIRTY";
  lines[39] = "FORTY";
  git(dir, "checkout", "feature");
  writeLines(dir, lines);
  git(dir, "add", "-A");
  git(dir, "commit", "--amend", "--no-edit");

  const panel = await updateAndOpenInterdiff(page);
  await expect(panel.locator("tr.add")).toHaveCount(1);
  await expect(panel.locator("tr.add")).toContainText("FORTY");
  await expect(panel).not.toContainText("THIRTY");
  await expect(panel).not.toContainText("c.txt");
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

  const featureLines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
  featureLines[4] = "FIVE";
  featureLines[29] = "THIRTY";
  featureLines[39] = "FORTY";
  writeLines(dir, featureLines);
  git(dir, "add", "a.txt");
  git(dir, "commit", "-a", "--amend", "--no-edit");

  const panel = await updateAndOpenInterdiff(page);
  await expect(panel.locator("tr.add")).toHaveCount(1);
  await expect(panel.locator("tr.add")).toContainText("FORTY");
  await expect(panel).not.toContainText("FIVE");
  await expect(panel).not.toContainText("other.txt");
  await expect(panel).not.toContainText("THIRTY");
  await expect(panel.locator(".interdiff-conflicts")).toHaveCount(0);
});
