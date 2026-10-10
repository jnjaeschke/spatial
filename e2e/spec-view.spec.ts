import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { openChange, startReview } from "./canvas.ts";

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
  writeFileSync(file, "// https://html.spec.whatwg.org/#navigate\nvoid Navigate() {\n  // Step 1. Edit the line.\n  Edit();\n  // Step 3. Add the file.\n  Other();\n  // Step 1. Edit the line.\n  Add();\n  Log();\n}\n");
  git(dir, "commit", "-am", "Implement navigate");
  return { dir, base };
}

test("a cited spec opens in the details panel and selecting a step maps its change rows", async ({ page }) => {
  const { dir, base } = specRepo();
  await startReview(page, dir, `${base}..HEAD`);
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  await openChange(page, "change-c1");
  const spec = page.locator(".review-chip.kind-spec").first();
  await expect(spec).toHaveText("navigate");
  await spec.click();
  const view = page.getByTestId("spec-panel");
  await expect(view.getByText("HTML#navigate")).toBeVisible();
  await expect(view.getByTestId("spec-map-status")).toHaveText("2 of 2 steps mapped · 1 deviates · 2 added lines unexplained", { timeout: 15_000 });
  await expect(view.getByTestId("step-1")).toHaveClass(/status-implements/);
  await expect(view.getByTestId("step-2")).toHaveClass(/status-deviates/);
  await view.getByTestId("unmapped-0").click();
  await expect(view.getByText("Logs the navigation.")).toBeVisible();
  await expect(page.locator(".canvas")).toHaveAttribute("data-place", /change:/);
  await expect(page.getByTestId(/finding-chip/).filter({ hasText: "Step 3 comment describes step 2 of HTML#navigate" })).toBeAttached();
  await expect(page.getByTestId(/finding-chip/).filter({ hasText: "Step 1 comment sits on code mapped to step 2 of HTML#navigate" })).toBeAttached();
  await expect(page.locator('.hunk-node tr[data-new="9"]')).toHaveClass(/step-mapped/);

  await view.getByTestId("step-2").click();
  await expect(view.getByText("Calls Other() instead of adding the file.")).toBeVisible();
  await expect(page.locator('.hunk-node tr[data-new="6"]')).toHaveClass(/step-mapped/);
  await expect(page.locator('.hunk-node tr[data-new="6"]')).toHaveClass(/map-deviates/);
  await expect(page.locator('.hunk-node tr[data-new="6"]')).toHaveClass(/focus/);
  await expect(page.locator('.hunk-node tr[data-new="3"]')).not.toHaveClass(/step-mapped/);

  await page.keyboard.press("Escape");
  await expect(view).toHaveCount(0);
});

test("topbar toggles hide spec chips with spec checks and AI findings, and persist", async ({ page }) => {
  const { dir, base } = specRepo();
  await startReview(page, dir, `${base}..HEAD`);
  await openChange(page, "change-c1");
  const check = page.getByTestId(/finding-chip/).filter({ hasText: "Step 3 comment describes step 2 of HTML#navigate" });
  await expect(check).toBeAttached({ timeout: 15_000 });
  await expect(page.locator(".review-chip.kind-spec")).toHaveCount(1);
  const specs = page.getByRole("group", { name: "Show on canvas" }).getByRole("button", { name: "Specs" });
  await specs.click();
  await expect(specs).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".review-chip.kind-spec")).toHaveCount(0);
  await expect(check).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("change-c1")).toBeVisible();
  await expect(page.locator(".review-chip.kind-spec")).toHaveCount(0);
  await specs.click();
  await expect(page.locator(".review-chip.kind-spec")).toHaveCount(1);
  await expect(check).toBeAttached();

  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await openChange(page, "change-c2");
  const finding = page.getByTestId(/finding-chip/).filter({ hasText: "No test for c" });
  await expect(finding).toBeAttached({ timeout: 15_000 });
  await page.getByRole("group", { name: "Show on canvas" }).getByRole("button", { name: "AI review" }).click();
  await expect(finding).toHaveCount(0);
});
