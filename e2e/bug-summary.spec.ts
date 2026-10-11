import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

const dirs: string[] = [];
test.afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function git(dir: string, ...args: string[]) {
  execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args]);
}
test("Gecko review renders the fetched Bugzilla report and its summary", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "spatial-bug-summary-")); dirs.push(dir);
  git(dir, "init", "-b", "main");
  writeFileSync(join(dir, "mach"), "");
  writeFileSync(join(dir, "moz.build"), "");
  writeFileSync(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { moz: { type: "http", url: "http://127.0.0.1:4180/mcp" } } }));
  writeFileSync(join(dir, "base.txt"), "base\n");
  git(dir, "add", "-A"); git(dir, "commit", "-m", "base");
  writeFileSync(join(dir, "c.txt"), "c\n");
  git(dir, "add", "-A"); git(dir, "commit", "-m", "Bug 4242 - Add c");

  await page.goto(`http://127.0.0.1:4178/repo?path=${encodeURIComponent(dir)}`);
  const start = page.getByLabel("start");
  await start.fill("/review HEAD~1..HEAD");
  await start.press("Enter");
  const card = page.getByTestId("bug-summary");
  await expect(card).toContainText("Bug 4242", { timeout: 30_000 });
  await expect(card).toContainText("c.txt is missing");
  await expect(card).toContainText("ASSIGNED");
  await card.locator("summary").click();
  await expect(card).toContainText("The bug reports that c.txt is missing", { timeout: 30_000 });
});
