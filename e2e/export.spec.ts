import { test, expect } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openChange, openPatch, startReview } from "./canvas.ts";

test("export saves a read-only copy without closed chats that expands context offline", async ({ page, request }) => {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  const fixture = sessions.find((session) => session.title === "fixture")!;
  await startReview(page, fixture.worktree, "HEAD~1..HEAD");
  await openPatch(page, 0);
  await page.getByRole("button", { name: "Ask about c1" }).click();
  const draft = page.locator('[data-testid^="chat-draft-"]');
  await draft.getByLabel("message").fill("Why this change?");
  await draft.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".msg.assistant", { hasText: "Stub answer." });
  await expect(answer).toBeVisible({ timeout: 10_000 });
  await page.locator(".chat-node").filter({ has: answer }).getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Export…" }).click();
  const dialog = page.getByRole("dialog", { name: "Export read-only copy" });
  await expect(dialog).toContainText("0 chats");
  await expect(dialog).toContainText("1 full file");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Save file" }).click()]);
  const file = join(mkdtempSync(join(tmpdir(), "spatial-export-")), "export.html");
  await download.saveAs(file);
  expect(readFileSync(file, "utf8")).not.toContain("Stub answer.");

  await page.goto(`file://${file}`);
  await expect(page.getByTestId("export-badge")).toBeVisible();
  await expect(page.getByTestId("change-c1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask about c1" })).toHaveCount(0);
  await expect(page.getByLabel("Reviewed c1")).toBeDisabled();
  await openChange(page);
  const hunk = page.getByTestId("hunk-f0h0");
  await expect(hunk.getByText("line 26", { exact: true })).toHaveCount(0);
  await hunk.getByRole("button", { name: "↑ 20 lines" }).click();
  await expect(hunk.getByText("line 26", { exact: true })).toBeAttached();
});
