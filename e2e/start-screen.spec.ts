import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test, expect, type Page } from "@playwright/test";

const repoDirs: string[] = [];

test.afterEach(() => {
  for (const dir of repoDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(dir: string, ...args: string[]) {
  return execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "spatial-start-"));
  repoDirs.push(dir);
  git(dir, "init", "-b", "main");
  writeFileSync(join(dir, "base.txt"), "base\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "base");
  git(dir, "checkout", "-b", "change");
  writeFileSync(join(dir, "change.txt"), "change\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "change");
  return dir;
}

async function createSession(page: Page, repo: string, title: string) {
  const response = await page.request.post("http://127.0.0.1:4178/api/sessions", { data: { repo, title } });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test("start screen lists the repo's sessions newest first and creates a review session", async ({ page }) => {
  const dir = makeRepo();
  await createSession(page, dir, "Session A");
  await new Promise((resolve) => setTimeout(resolve, 5));
  await createSession(page, dir, "Session B");

  await page.goto(`http://127.0.0.1:4178/?path=${encodeURIComponent(dir)}`);
  await expect(page.getByRole("heading", { level: 2, name: basename(dir) })).toBeVisible();
  const items = page.locator(".session-list li");
  const titles = await items.allTextContents();
  expect(titles.findIndex((text) => text.includes("Session B"))).toBeLessThan(titles.findIndex((text) => text.includes("Session A")));

  await page.getByLabel("start").fill("/chat Hello");
  await page.getByLabel("start").press("Enter");
  await expect(page).toHaveURL(/\?session=/);
  await expect(page.getByTestId("conversation")).toBeVisible();
  await page.getByRole("link", { name: basename(dir) }).click();
  await expect(page.getByTestId("start-screen").getByRole("link", { name: /Hello/ })).toBeVisible();
});

test("sessions of another worktree appear under the same repo", async ({ page }) => {
  const dir = makeRepo();
  const wt = mkdtempSync(join(tmpdir(), "spatial-start-wt-"));
  repoDirs.push(wt);
  git(dir, "worktree", "add", "-q", wt, "-b", `wt-${crypto.randomUUID()}`);
  await createSession(page, dir, "Main session");
  await createSession(page, wt, "Worktree session");

  await page.goto(`http://127.0.0.1:4178/?path=${encodeURIComponent(dir)}`);
  const worktreeItem = page.locator(".session-list li").filter({ hasText: "Worktree session" });
  await expect(worktreeItem).toContainText(realpathSync(wt));

  await page.goto("http://127.0.0.1:4178/");
  const group = page.getByTestId("repo-group").filter({ has: page.getByRole("heading", { name: basename(dir) }) });
  await expect(group.getByText("Worktree session")).toBeVisible();
  await expect(group.getByText("Main session")).toBeVisible();
});

test("start screen switches between recent repositories", async ({ page }) => {
  const first = makeRepo();
  const second = makeRepo();
  await createSession(page, first, "First session");
  await createSession(page, second, "Second session");
  await page.goto(`http://127.0.0.1:4178/?path=${encodeURIComponent(first)}`);

  const switcher = page.getByRole("navigation", { name: "Recent repositories" });
  const link = switcher.getByRole("link").filter({ hasText: realpathSync(second) });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`\\?path=${encodeURIComponent(realpathSync(second))}`));
  await expect(page.getByTestId("start-screen").getByRole("link", { name: /Second session/ })).toBeVisible();
});

test("start screen outside a git work tree shows the error", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "spatial-not-repo-"));
  repoDirs.push(dir);
  await page.goto(`http://127.0.0.1:4178/?path=${encodeURIComponent(dir)}`);
  await expect(page.getByTestId("start-error")).toContainText("Not a git repository");
});

test("folder picker navigates to a repository", async ({ page }) => {
  const parent = mkdtempSync(join(tmpdir(), "spatial-picker-"));
  repoDirs.push(parent);
  const dir = join(parent, "picked-repo");
  mkdirSync(dir);
  git(dir, "init", "-b", "main");
  writeFileSync(join(dir, "base.txt"), "base\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "base");
  await createSession(page, dir, "Picked session");
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("button", { name: "Open folder…" }).click();
  const dialog = page.getByRole("dialog", { name: "Open folder" });
  await dialog.getByLabel("Path").fill(realpathSync(parent));
  await dialog.getByRole("button", { name: "Go" }).click();
  await dialog.getByRole("button", { name: /picked-repo/ }).click();
  await dialog.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`\\?path=${encodeURIComponent(realpathSync(dir))}`));
  await expect(page.getByTestId("start-screen").getByRole("link", { name: "Picked session" })).toBeVisible();
});
