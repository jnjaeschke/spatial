import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { revealNode, setLevel } from "./canvas.ts";

const repoDirs: string[] = [];

test.afterEach(() => {
  for (const dir of repoDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(dir: string, ...args: string[]) {
  return execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trimEnd();
}

test("/review with uncommitted changes reviews them and leaves the repo untouched", async ({ page }) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "spatial-worktree-")));
  repoDirs.push(dir);
  git(dir, "init", "-b", "main");
  const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
  writeFileSync(join(dir, "a.txt"), `${lines.join("\n")}\n`);
  writeFileSync(join(dir, ".gitignore"), "ignored.log\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "base");
  lines[29] = "THIRTY";
  writeFileSync(join(dir, "a.txt"), `${lines.join("\n")}\n`);
  writeFileSync(join(dir, "c.txt"), "c\n");
  writeFileSync(join(dir, "ignored.log"), "noise\n");

  const snapshot = () => ({
    head: git(dir, "rev-parse", "HEAD"),
    branches: git(dir, "for-each-ref", "refs/heads", "refs/tags", "refs/remotes"),
    status: git(dir, "--no-optional-locks", "status", "--porcelain"),
    index: readFileSync(join(dir, ".git", "index")),
    files: readdirSync(dir).sort(),
  });
  const before = snapshot();
  expect(before.status).toBe(" M a.txt\n?? c.txt");

  await page.goto(`http://127.0.0.1:4178/?path=${encodeURIComponent(dir)}`);
  const box = page.getByLabel("start");
  await box.fill("/review ");
  await box.press("Enter");
  await expect(page).toHaveURL(/\?session=/);
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  await setLevel(page, "code");
  await revealNode(page, "summary");
  await expect(page.getByTestId("summary")).toContainText("Edits a and adds c.");
  await expect(page.getByTestId("hunk-f0h0")).toContainText("THIRTY");
  await revealNode(page, "hunk-f1h0");
  await expect(page.getByTestId("hunk-f1h0")).toContainText("c");
  await expect(page.getByTestId("task-review")).toHaveAttribute("data-status", "succeeded", { timeout: 15_000 });
  await expect(page.getByTestId("toasts")).not.toContainText("New revision available");

  expect(snapshot()).toEqual(before);
  const refs = git(dir, "for-each-ref", "--format=%(refname)", "refs/spatial").split("\n");
  expect(refs).toHaveLength(1);
  expect(refs[0]).toMatch(/^refs\/spatial\/worktree\/[0-9a-f]{12}$/);
  expect(git(dir, "log", "-1", "--format=%s", refs[0]!)).toBe("Uncommitted changes");
  expect(git(dir, "rev-parse", `${refs[0]}^`)).toBe(before.head);
  expect(git(dir, "ls-tree", "-r", "--name-only", refs[0]!)).toBe(".gitignore\na.txt\nc.txt");
});
