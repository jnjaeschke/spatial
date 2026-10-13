import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, makeRepo } from "./repo.ts";
import { test, expect } from "@playwright/test";

const dirs: string[] = [];
test.afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
test("Gecko review renders the fetched Bugzilla report and its summary", async ({ page }) => {
  const dir = makeRepo("spatial-bug-summary-", { "mach": "", "moz.build": "", ".mcp.json": JSON.stringify({ mcpServers: { moz: { type: "http", url: "http://127.0.0.1:4180/mcp" } } }), "base.txt": "base\n" }); dirs.push(dir);
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
