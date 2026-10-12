import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";

const dirs: string[] = [];
test.afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function git(dir: string, ...args: string[]) {
  return execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();
}

/** main: root, 250 filler commits, then a merge of `feature` (2 commits); tag v1 on the root; origin/main and origin/gone remote refs. */
function makeRepo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "spatial-scm-")));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.txt"), "a\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "root commit");
  const root = git(dir, "rev-parse", "HEAD");
  git(dir, "tag", "v1");
  for (let i = 1; i <= 250; i++) git(dir, "commit", "-q", "--allow-empty", "-m", `filler ${i}`);
  git(dir, "switch", "-q", "-c", "feature");
  writeFileSync(join(dir, "f.txt"), "one\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "feature one");
  writeFileSync(join(dir, "f.txt"), "one\ntwo\n");
  git(dir, "commit", "-q", "-am", "feature two");
  const feature = git(dir, "rev-parse", "HEAD");
  git(dir, "switch", "-q", "main");
  git(dir, "merge", "-q", "--no-ff", "-m", "merge feature", "feature");
  const merge = git(dir, "rev-parse", "HEAD");
  git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(dir, "update-ref", "refs/remotes/origin/gone", root);
  return { dir, root, feature, merge };
}

const graphUrl = (dir: string, query = "") => `http://127.0.0.1:4178/repo/scm?path=${encodeURIComponent(dir)}${query}`;
const rows = (page: Page) => page.getByRole("listbox", { name: "Commits" }).getByTestId("graph-row");

test("the repo page links the Git page, which shows the graph with ref pills", async ({ page }) => {
  const { dir, merge } = makeRepo();
  await page.goto(`http://127.0.0.1:4178/repo?path=${encodeURIComponent(dir)}`);
  await page.getByRole("navigation", { name: "Repository views" }).getByRole("link", { name: "Git" }).click();
  await expect(page).toHaveURL(/\/repo\/scm\?path=/);
  const first = rows(page).first();
  await expect(first).toHaveAttribute("data-sha", merge);
  await expect(first).toContainText("merge feature");
  await expect(first.locator('.ref-pill[data-ref="head:main"]')).toBeVisible();
  await expect(rows(page).filter({ hasText: "feature two" }).locator('.ref-pill[data-ref="head:feature"]')).toBeVisible();
  await expect(first.locator("svg.lanes circle")).toHaveCount(1);
});

test("scrolling loads the next page", async ({ page }) => {
  const { dir } = makeRepo();
  await page.goto(graphUrl(dir));
  await expect(rows(page).first()).toBeVisible();
  const list = page.getByRole("listbox", { name: "Commits" });
  for (let i = 0; i < 20 && await rows(page).filter({ hasText: "root commit" }).count() === 0; i++) {
    await list.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await page.waitForTimeout(150);
  }
  await expect(rows(page).filter({ hasText: "root commit" })).toBeVisible();
});

test("scopes, selection in the URL, keyboard and jump", async ({ page }) => {
  const { dir, root, feature, merge } = makeRepo();
  await page.goto(graphUrl(dir));
  await rows(page).first().click();
  await expect(page).toHaveURL(new RegExp(`commit=${merge}`));
  await page.getByRole("listbox", { name: "Commits" }).press("ArrowDown");
  await expect(rows(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await page.getByRole("listbox", { name: "Commits" }).press("Escape");
  await expect(page).not.toHaveURL(/commit=/);
  await page.getByLabel("Jump to commit").fill(root.slice(0, 10));
  await page.getByLabel("Jump to commit").press("Enter");
  await expect(page).toHaveURL(new RegExp(`commit=${root}`));
  await expect(rows(page).filter({ hasText: "root commit" })).toHaveAttribute("aria-selected", "true");
  git(dir, "switch", "-q", "feature");
  git(dir, "commit", "-q", "--allow-empty", "-m", "feature three");
  const three = git(dir, "rev-parse", "HEAD");
  await page.getByRole("group", { name: "Scope" }).getByRole("button", { name: "Current branch" }).click();
  await expect(page).toHaveURL(/scope=current/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAttribute("data-sha", three);
  expect(feature).not.toBe(three);
});

test("the refs sidebar groups branches and keeps tags closed", async ({ page }) => {
  const { dir, root } = makeRepo();
  await page.goto(graphUrl(dir));
  const sidebar = page.getByLabel("Refs");
  await expect(sidebar.getByRole("button", { name: /^main/ })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "origin/gone" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "v1" })).toHaveCount(0);
  await sidebar.getByText("Tags").click();
  await sidebar.getByRole("button", { name: "v1" }).click();
  await expect(page).toHaveURL(new RegExp(`commit=${root}`));
});

test("the Git session view shows the session's graph", async ({ page }) => {
  const { dir, merge } = makeRepo();
  const response = await page.request.post("http://127.0.0.1:4178/api/sessions", { data: { repo: dir, title: "Git view" } });
  const session = await response.json();
  await page.goto(`http://127.0.0.1:4178/sessions/${session.id}?view=scm`);
  await expect(rows(page).first()).toHaveAttribute("data-sha", merge);
});

test("an unknown repo view says so", async ({ page }) => {
  const { dir } = makeRepo();
  await page.goto(`http://127.0.0.1:4178/repo/nope?path=${encodeURIComponent(dir)}`);
  await expect(page.getByTestId("repo-view-page")).toContainText("No repository view");
});
