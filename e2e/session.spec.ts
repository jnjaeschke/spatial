import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setLevel, startReview } from "./canvas.ts";

test.describe.configure({ mode: "serial" });

test("the fixture session shows the finished analysis", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  await setLevel(page, "code");
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
  await setLevel(page, "code");
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
  await setLevel(page, "code");
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
  const focused = page.getByTestId("change-c1").locator('tr.focus[data-new="30"]');
  await expect(focused).toBeInViewport();
  await expect(focused).toContainText("THIRTY");
  await panel.getByRole("button", { name: "Close file" }).click();
  await expect(panel).toHaveCount(0);
});

test("code span in an explanation opens the file at the matching line", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await setLevel(page, "concept");
  await page.getByTestId("change-c1").getByRole("button", { name: "THIRTY" }).click();
  const focus = page.getByTestId("file-panel").locator("tr.focus");
  await expect(focus).toHaveText(/THIRTY/);
  await expect(focus).toBeInViewport();
});

test("the canvas works without the Navigation API", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "navigation", { value: undefined }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: "fixture" }).click();
  await expect(page.getByTestId("change-c1")).toBeVisible();
  await page.locator(".canvas").focus();
  await page.keyboard.press("n");
  await expect(page.getByTestId("guide")).toContainText("1/");
  expect(errors).toEqual([]);
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
