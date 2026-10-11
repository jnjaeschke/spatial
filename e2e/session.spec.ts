import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openChange, openPatch, placeUp, startReview, waitForCanvasSettled } from "./canvas.ts";

test.describe.configure({ mode: "serial" });

test("the fixture session shows the finished analysis", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  await openPatch(page, 0);
  await expect(page.getByTestId("task-narrate")).toHaveAttribute("data-status", "succeeded");
  await expect(page.getByText("Edits a and adds c.")).toBeVisible();
  await expect(page.getByTestId("analysis")).toHaveCount(0);
});

test("a single-commit review has the guide and reviewed marks", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  const guide = page.getByTestId("guide");
  await expect(guide).toContainText("Start here", { timeout: 15_000 });
  await expect(guide).toContainText("Edit a");
  await expect(page.getByTestId("change-c1").locator(".commit-tag")).toHaveCount(0);
  await guide.getByRole("button", { name: "Next step" }).click();
  await guide.getByRole("button", { name: "Toggle reviewed" }).click();
  await expect(guide.getByTestId("guide-progress")).toHaveText("1/2 reviewed");
  await expect(page.getByLabel("Reviewed c1")).toBeChecked();
  await guide.getByRole("button", { name: "Toggle reviewed" }).click();
  await expect(guide.getByTestId("guide-progress")).toHaveText("0/2 reviewed");
});

test("expand context around a hunk", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await openChange(page);
  const hunk = page.getByTestId("hunk-f0h0");
  await expect(hunk.getByText("line 27", { exact: true })).toBeAttached();
  await expect(hunk.getByText("line 26", { exact: true })).toHaveCount(0);
  await hunk.getByRole("button", { name: "↓ 20 lines" }).click();
  await expect(hunk.getByText("line 53", { exact: true })).toBeAttached();
  await expect(hunk.getByText("line 54", { exact: true })).toHaveCount(0);
  await hunk.getByRole("button", { name: "↑ 20 lines" }).click();
  await expect(hunk.getByText("line 7", { exact: true })).toBeAttached();
  await expect(hunk.getByText("line 6", { exact: true })).toHaveCount(0);
  await hunk.getByRole("button", { name: "↑ 20 lines" }).click();
  await expect(hunk.getByText("line 1", { exact: true })).toBeAttached();
  await expect(hunk.getByRole("button", { name: "↑ 20 lines" })).toHaveCount(0);
  const below = hunk.getByRole("button", { name: "↓ 20 lines" });
  for (let i = 0; i < 5 && (await below.boundingBox())!.y > 800; i++) {
    const x = await page.evaluate(() => [...Array(60).keys()].map((i) => 10 + i * 20).find((x) => document.elementFromPoint(x, 650)?.classList.contains("react-flow__pane")));
    expect(x).toBeDefined();
    await page.mouse.move(x!, 650);
    await page.mouse.down();
    await page.mouse.move(x!, 400, { steps: 5 });
    await page.mouse.move(x!, 150, { steps: 5 });
    await page.mouse.up();
  }
  await below.click();
  await expect(hunk.getByText("line 60", { exact: true })).toBeAttached();
  await expect(hunk.getByRole("button", { name: "↓ 20 lines" })).toHaveCount(0);
});

test("a failed analysis shows the error and a retry", async ({ page, request }) => {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  const fixture = sessions.find((session) => session.title === "fixture")!;
  await startReview(page, fixture.worktree, "HEAD..HEAD~1");
  await expect(page.getByTestId("task-importDiff").first()).toHaveAttribute("data-status", "failed", { timeout: 10_000 });
  await expect(page.getByTestId("analysis")).toContainText(/is not an ancestor of/);
  await expect(page.getByTestId("analysis")).toHaveAttribute("data-state", "failed");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("task-importDiff")).toHaveCount(2, { timeout: 10_000 });
  await expect(page.getByTestId("analysis")).toContainText(/is not an ancestor of/);
});

test("open the whole file in the side panel", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await openChange(page);
  await page.getByTestId("hunk-f0h0").getByRole("button", { name: "a.txt" }).click();
  const panel = page.getByTestId("file-panel");
  await expect(panel.getByText("line 1", { exact: true })).toBeAttached();
  await expect(panel.getByText("line 60", { exact: true })).toBeAttached();
  await expect(panel.getByText("THIRTY", { exact: true })).toBeInViewport();
  await expect(panel.locator("td.code").first()).toHaveCSS("white-space", "pre-wrap");
  await expect(panel.locator("tr.add")).toHaveCSS("background-color", "rgb(230, 255, 236)");
  await expect(panel.locator("tr", { hasText: "line 1" }).first()).not.toHaveClass(/jumps/);
  await page.getByTestId("change-c1").getByRole("button", { name: "Collapse" }).click();
  await panel.locator("tr", { has: page.getByText("THIRTY", { exact: true }) }).click();
  const focused = page.locator('tr.focus[data-new="30"]');
  await expect(focused).toBeInViewport();
  await expect(focused).toContainText("THIRTY");
  await panel.getByRole("button", { name: "Close file" }).click();
  await expect(panel).toHaveCount(0);
});

test("code span in an explanation jumps to the matching row of its change", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await openPatch(page, 0);
  await page.getByTestId("change-c1").getByRole("button", { name: "THIRTY" }).click();
  const focus = page.locator('tr.focus[data-new="30"]');
  await expect(focus).toHaveText(/THIRTY/);
  await expect(focus).toBeInViewport();
  await expect(page.getByTestId("file-panel")).toHaveCount(0);
});

test("the focus crumb names the jumped-to row and re-centers it", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await openPatch(page, 0);
  await openChange(page, "change-c1");
  const placeCrumbs = page.getByTestId("place-crumbs");
  await expect(placeCrumbs).toHaveText(/^Patch\s*›\s*Edit a$/);
  const crumb = page.getByTestId("focus-crumb");
  await expect(crumb).toHaveCount(0);
  await page.getByTestId("place-up").click();
  await expect(page.locator(".canvas")).toHaveAttribute("data-place", "patch:0");
  await openChange(page, "change-c1");
  await page.getByTestId("change-c1").getByRole("button", { name: "THIRTY" }).click();
  await expect(crumb).toHaveText("a.txt:30");
  const focus = page.locator('tr.focus[data-new="30"]');
  await expect(focus).toBeInViewport();
  await waitForCanvasSettled(page);
  await page.locator(".canvas").focus();
  for (let i = 0; i < 25; i++) await page.keyboard.press("ArrowRight");
  await expect(focus).not.toBeInViewport();
  await crumb.click();
  await expect(focus).toBeInViewport();
  await expect(crumb).toHaveText("a.txt:30");
});

const viewportOf = (page: Page) => page.locator(".react-flow__viewport").getAttribute("style");

test("the place is in the URL and the title; reload keeps the place and the viewport", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await openChange(page, "change-c1");
  await expect(page).toHaveURL(/\/sessions\/[^/]+\/change\/c1$/);
  await expect(page).toHaveTitle(/^Edit a · .* · spatial$/);
  await page.getByTestId("change-c1").getByRole("button", { name: "THIRTY" }).click();
  await expect(page).toHaveTitle(/^a\.txt:30 · Edit a · /);
  await waitForCanvasSettled(page);
  const before = await viewportOf(page);
  await page.reload();
  await waitForCanvasSettled(page);
  await expect(page.locator(".canvas")).toHaveAttribute("data-place", "change:c1");
  expect(await viewportOf(page)).toBe(before);
  await expect(page.locator('tr.focus[data-new="30"]')).toHaveCount(1);
  await placeUp(page);
  await expect(page).toHaveURL(/\/patch\/0$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/change\/c1$/);
  await expect(page.locator(".canvas")).toHaveAttribute("data-place", "change:c1");
});

test("a place the graph does not have shows the initial place and replaces the URL", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  const initial = page.url();
  const place = await page.locator(".canvas").getAttribute("data-place");
  await page.goto(`${initial.replace(/\/$/, "")}/change/nope`);
  await expect(page.locator(".canvas")).toHaveAttribute("data-place", place!);
  await expect.poll(() => new URL(page.url()).pathname.endsWith("/change/nope")).toBe(false);
  const length = await page.evaluate(() => history.length);
  await page.reload();
  expect(await page.evaluate(() => history.length)).toBe(length);
});

test("the Recent menu lists the visited places and traverses to one", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await openChange(page, "change-c1");
  await placeUp(page);
  await openChange(page, "change-c2");
  await page.getByTestId("place-recent").click();
  const items = page.getByTestId("place-recent-menu").getByRole("menuitem");
  await expect(items.first()).toHaveAttribute("aria-current", "true");
  await expect(items.first()).toBeDisabled();
  expect(await items.allTextContents()).toEqual(expect.arrayContaining(["Add c · Patch", "Edit a · Patch"]));
  const index = await page.evaluate(() => navigation.currentEntry!.index);
  await items.filter({ hasText: /^Edit a/ }).first().click();
  await expect(page.locator(".canvas")).toHaveAttribute("data-place", "change:c1");
  expect(await page.evaluate(() => navigation.currentEntry!.index)).toBeLessThan(index);
  await expect(page.getByTestId("place-recent-menu")).toHaveCount(0);
});

test("a large diff whose narration failed lists files and mounts hunks on demand", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "spatial-large-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "base.txt"), "base\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  for (let f = 0; f < 25; f++) writeFileSync(join(dir, `f${f}.txt`), Array.from({ length: 100 }, (_, i) => f === 0 && i === 0 ? "FAIL-THIS-TURN" : `file ${f} line ${i}`).join("\n") + "\n");
  git("add", "-A");
  git("commit", "-q", "-m", "large");
  await startReview(page, dir, "HEAD~1..HEAD");
  const files = page.locator(".revision-file");
  await expect(files).toHaveCount(25, { timeout: 15_000 });
  await expect(page.locator(".revision-files [data-testid^=hunk-]")).toHaveCount(0);
  await files.filter({ hasText: "f3.txt" }).locator("summary").click();
  await expect(page.locator(".revision-files [data-testid^=hunk-]")).toHaveCount(1);
  await expect(page.getByText("file 3 line 99", { exact: true })).toBeVisible();
});
