import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

const dirs: string[] = [];
test.afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function git(dir: string, ...args: string[]) {
  return execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();
}

function makeRepo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "spatial-scm-")));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.txt"), "a\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  git(dir, "branch", "feature/x");
  git(dir, "tag", "v1");
  git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(dir, "update-ref", "refs/remotes/origin/gone", "HEAD");
  return { dir, head: git(dir, "rev-parse", "HEAD") };
}

test("the repo page links the Git page, which lists the refs", async ({ page }) => {
  const { dir, head } = makeRepo();
  await page.goto(`http://127.0.0.1:4178/repo?path=${encodeURIComponent(dir)}`);
  await page.getByRole("navigation", { name: "Repository views" }).getByRole("link", { name: "Git" }).click();
  await expect(page).toHaveURL(new RegExp(`/repo/scm\\?path=${encodeURIComponent(dir)}$`));
  const view = page.getByTestId("scm-view");
  const local = view.getByRole("table", { name: "Local branches" });
  const main = local.getByRole("row", { name: /^main/ });
  await expect(main).toContainText(head.slice(0, 12));
  await expect(main.locator(".ref-chip", { hasText: "origin" })).toHaveAttribute("title", "origin/main");
  await expect(main.locator(".ref-chip.worktree.current")).toHaveAttribute("title", dir);
  await expect(local.getByRole("row", { name: /feature\/x/ })).toBeVisible();
  const remoteOnly = view.getByRole("table", { name: "Remote only" });
  await expect(remoteOnly.getByRole("row", { name: /origin\/gone/ })).toBeVisible();
  await expect(remoteOnly.getByRole("row", { name: /origin\/main/ })).toHaveCount(0);
  await expect(view.getByRole("table", { name: "Tags" })).toHaveCount(0);
  await view.getByText("Tags").click();
  await expect(view.getByRole("table", { name: "Tags" }).getByRole("row", { name: /v1/ })).toBeVisible();
  await page.getByRole("link", { name: /spatial-scm-/ }).click();
  await expect(page.getByTestId("start-screen")).toBeVisible();
});

test("the Git session view shows the session's repository", async ({ page }) => {
  const { dir } = makeRepo();
  const response = await page.request.post("http://127.0.0.1:4178/api/sessions", { data: { repo: dir, title: "Git view" } });
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  await page.goto(`http://127.0.0.1:4178/sessions/${session.id}?view=scm`);
  await expect(page.getByTestId("scm-view").getByRole("row", { name: /feature\/x/ })).toBeVisible();
});

test("an unknown repo view says so", async ({ page }) => {
  const { dir } = makeRepo();
  await page.goto(`http://127.0.0.1:4178/repo/nope?path=${encodeURIComponent(dir)}`);
  await expect(page.getByTestId("repo-view-page")).toContainText("No repository view");
});
