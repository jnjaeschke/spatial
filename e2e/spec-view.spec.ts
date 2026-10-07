import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { revealNode, startReview } from "./canvas.ts";

const dirs: string[] = [];
test.afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function git(dir: string, ...args: string[]) {
  return execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();
}

function specRepo() {
  const dir = mkdtempSync(join(tmpdir(), "spatial-spec-"));
  dirs.push(dir);
  git(dir, "init", "-b", "main");
  const file = join(dir, "SpecViewFixture.cpp");
  writeFileSync(file, "// https://html.spec.whatwg.org/#navigate\nvoid Navigate() {\n}\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "base");
  const base = git(dir, "rev-parse", "HEAD");
  writeFileSync(file, "// https://html.spec.whatwg.org/#navigate\nvoid Navigate() {\n  // Step 1. Edit the line.\n  Edit();\n  // Step 3. Add the file.\n  Other();\n}\n");
  git(dir, "commit", "-am", "Implement navigate");
  return { dir, base };
}

test("a cited spec opens beside its code, colored by the step map; Step comments are checked", async ({ page }) => {
  const { dir, base } = specRepo();
  await startReview(page, dir, `${base}..HEAD`);
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Step 3 comment describes step 2 of HTML#navigate")).toBeAttached();

  const spec = page.locator(".spec-node");
  await revealNode(page, spec);
  await spec.getByRole("button", { name: "Steps" }).click();
  const view = page.getByTestId("spec-view");
  await expect(view.getByTestId("spec-map-status")).toHaveText("2 of 2 steps mapped · 1 deviates · 1 added line not mapped", { timeout: 15_000 });
  await expect(view.getByTestId("step-1")).toHaveClass(/status-implements/);
  await expect(view.getByTestId("step-2")).toHaveClass(/status-deviates/);
  await expect(view.locator('tr[data-new="5"]')).toHaveClass(/map-none/);

  await view.getByTestId("step-2").click();
  await expect(view.getByText("Calls Other() instead of adding the file.")).toBeVisible();
  await expect(view.locator('tr[data-new="6"]')).toHaveClass(/map-selected/);
  await expect(view.locator('tr[data-new="3"]')).not.toHaveClass(/map-selected/);

  await view.locator('tr[data-new="4"]').click();
  await expect(view.getByTestId("step-1")).toHaveClass(/selected/);
  await expect(view.locator('tr[data-new="3"]')).toHaveClass(/map-selected/);

  await page.keyboard.press("Escape");
  await expect(view).toHaveCount(0);
});

test("topbar toggles hide spec cards with spec checks and AI findings, and persist", async ({ page }) => {
  const { dir, base } = specRepo();
  await startReview(page, dir, `${base}..HEAD`);
  const check = page.getByText("Step 3 comment describes step 2 of HTML#navigate");
  await expect(check).toBeAttached({ timeout: 15_000 });
  await expect(page.locator(".spec-node")).toHaveCount(1);
  const specs = page.getByRole("group", { name: "Show on canvas" }).getByRole("button", { name: "Specs" });
  await specs.click();
  await expect(specs).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".spec-node")).toHaveCount(0);
  await expect(check).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("change-c1")).toBeVisible();
  await expect(page.locator(".spec-node")).toHaveCount(0);
  await specs.click();
  await expect(page.locator(".spec-node")).toHaveCount(1);
  await expect(check).toBeAttached();

  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  const finding = page.getByText("No test for c");
  await expect(finding).toBeAttached({ timeout: 15_000 });
  await page.getByRole("group", { name: "Show on canvas" }).getByRole("button", { name: "AI review" }).click();
  await expect(finding).toHaveCount(0);
});
