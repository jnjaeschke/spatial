import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { openChange, openPatch, revealNode, startReview } from "./canvas.ts";

const repoDirs: string[] = [];
const control = "http://127.0.0.1:4179/control";
let revisionCount = 0;

test.afterEach(() => {
  for (const dir of repoDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A revision and diff ids no other test uses: workers run in parallel against one server, and Phabricator diff ids are global. */
function newRevision() {
  const revision = 1000 + test.info().workerIndex * 100 + revisionCount++;
  return { revision, d1: revision * 10 + 1, d2: revision * 10 + 2 };
}

function git(dir: string, ...args: string[]) {
  return execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();
}

function writeLines(dir: string, values: string[]) {
  writeFileSync(join(dir, "a.txt"), `${values.join("\n")}\n`);
}

function inlineTx(id: number, path: string, line: number, body: string, options: { diffId: number; isNewFile?: boolean; isDone?: boolean; phid?: string }) {
  return { id, phid: `PHID-XACT-${id}`, type: "inline", authorPHID: "PHID-USER-alice", objectPHID: "PHID-DREV-1", dateCreated: id, dateModified: id, groupID: null, comments: [{ id: id + 100, phid: options.phid ?? `PHID-XCMT-${id}`, version: 1, authorPHID: "PHID-USER-alice", dateCreated: id - 1, dateModified: id, removed: false, content: { raw: body } }], fields: { diff: { id: options.diffId, phid: `PHID-DIFF-${options.diffId}` }, path, line, length: 1, isNewFile: options.isNewFile ?? true, replyToCommentPHID: null, isDone: options.isDone ?? false, hasSuggestion: false, suggestionText: null } };
}

function commentTx(id: number, body: string, author = "alice") {
  return { id, phid: `PHID-XACT-${id}`, type: "comment", authorPHID: `PHID-USER-${author}`, objectPHID: "PHID-DREV-1", dateCreated: id, dateModified: id, groupID: null, comments: [{ id: id + 100, phid: `PHID-XCMT-${id}`, version: 1, authorPHID: `PHID-USER-${author}`, dateCreated: id, dateModified: id, removed: false, content: { raw: body } }], fields: {} };
}

async function configure(request: APIRequestContext, revision: number, value: object) {
  const response = await request.post(control, { data: { revision, ...value } });
  expect(response.ok()).toBeTruthy();
}

/** Configures the fake Conduit before the session opens: the syncer caches raw diffs, as they never change on Phabricator. */
async function openNarratedWithTrailer(page: Page, request: APIRequestContext, revision: number, conduit: (diff: string) => object) {
  const dir = mkdtempSync(join(tmpdir(), "spatial-phab-"));
  repoDirs.push(dir);
  git(dir, "init", "-b", "main");
  writeLines(dir, Array.from({ length: 60 }, (_, i) => `line ${i + 1}`));
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "base");
  git(dir, "checkout", "-b", "feature");
  const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
  lines[29] = "THIRTY";
  writeLines(dir, lines);
  writeFileSync(join(dir, "c.txt"), "c\nROUTE-UPDATE-REVIEW\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "initial patch", "-m", `Differential Revision: https://phab.example.com/D${revision}`);
  const diff = git(dir, "diff", "main", "feature");
  await configure(request, revision, conduit(diff));
  await startReview(page, dir, "main..feature");
  await openPatch(page, 0);
  await revealNode(page, "summary");
  return { dir, diff };
}

async function amendWith(dir: string, mode: { insertAfter27: true } | { replaceLine30: true }) {
  git(dir, "checkout", "feature");
  const lines = readFileSync(join(dir, "a.txt"), "utf8").trimEnd().split("\n");
  if ("insertAfter27" in mode) lines.splice(27, 0, "INSERTED");
  else lines[29] = "30-edited";
  writeLines(dir, lines);
  writeFileSync(join(dir, "d.txt"), "d\n");
  git(dir, "add", "-A");
  git(dir, "commit", "--amend", "--no-edit");
}

test("remote diff and inline comment: toast, anchored thread, general comment", async ({ page, request }) => {
  const ids = newRevision();
  const { diff } = await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [commentTx(121, "Looks fine overall")] }));
  await expect(page.getByTestId("summary")).toContainText("Looks fine overall", { timeout: 10_000 });
  await configure(request, ids.revision, { diffs: [ids.d2, ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(122, "a.txt", 30, "Why THIRTY?", { diffId: ids.d1 }), commentTx(121, "Looks fine overall")] });
  const notice = page.getByTestId(`toast-phab-diff:D${ids.revision}:${ids.d2}`);
  await expect(notice).toContainText(`moz-phab patch D${ids.revision}`, { timeout: 10_000 });
  await expect(notice.locator("button")).toHaveCount(1);
  await openChange(page);
  const chip = page.locator(".review-chip.kind-phab").filter({ hasText: "Why THIRTY?" });
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await chip.click();
  await expect(page.getByTestId("phab-panel")).toContainText("alice");
  await expect(page.getByTestId(/^toast-phab-comments:/)).toContainText("1 new comment");
});

test("old-side inline is listed unanchored", async ({ page, request }) => {
  const ids = newRevision();
  await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(130, "a.txt", 30, "Old side note", { diffId: ids.d1, isNewFile: false })] }));
  const summary = page.getByTestId("summary");
  const chip = summary.locator(".review-chip.kind-phab").filter({ hasText: "Old side note" });
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await chip.click();
  await expect(page.getByTestId("phab-panel")).toContainText("alice");
});

test("done thread is collapsed and follows isDone", async ({ page, request }) => {
  const ids = newRevision();
  const initial = [inlineTx(140, "a.txt", 30, "Finished", { diffId: ids.d1, isDone: true, phid: "PHID-XCMT-DONE" }), inlineTx(141, "a.txt", 31, "Still open", { diffId: ids.d1, phid: "PHID-XCMT-OPEN" })];
  const { diff } = await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: initial }));
  await openChange(page);
  const done = page.locator(".review-chip.kind-phab").filter({ hasText: "Finished" });
  await expect(done).toHaveClass(/dismissed/, { timeout: 10_000 });
  const open = page.locator(".review-chip.kind-phab").filter({ hasText: "Still open" });
  await expect(open).not.toHaveClass(/dismissed/);
  await done.click();
  await expect(page.getByTestId("phab-panel").locator(".phab-detail-location .phab-done")).toBeVisible();
  initial[1].fields.isDone = true;
  await configure(request, ids.revision, { diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: initial });
  await expect(open).toHaveClass(/dismissed/, { timeout: 10_000 });
});

test("inline on a non-matching diff goes to the summary list", async ({ page, request }) => {
  const ids = newRevision();
  await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d2, ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(150, "a.txt", 30, "Different patch", { diffId: ids.d2 })] }));
  const chip = page.getByTestId("summary").locator(".review-chip.kind-phab").filter({ hasText: "Different patch" });
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await chip.click();
  await expect(page.getByTestId("phab-panel")).toContainText("alice");
});

test("ask about a remote comment: chat inside the thread node", async ({ page, request }) => {
  const ids = newRevision();
  await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(160, "a.txt", 30, "Why is this needed?", { diffId: ids.d1 })] }));
  await openChange(page);
  const chip = page.locator(".review-chip.kind-phab").filter({ hasText: "Why is this needed?" });
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await chip.click();
  const thread = page.getByTestId("phab-panel");
  await thread.getByLabel("message").fill("Explain this comment");
  await thread.getByRole("button", { name: "Send" }).click();
  await expect(thread).toContainText("Stub answer.", { timeout: 15_000 });
  await expect(thread).toContainText("Explain this comment");
  await expect(page.locator(".chat-node")).toHaveCount(0);
  await expect(thread).not.toContainText("# Previous narrative");
});

test("remote inline follows the patch across an amend", async ({ page, request }) => {
  const ids = newRevision();
  const { dir } = await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(170, "a.txt", 30, "Why THIRTY?", { diffId: ids.d1 })] }));
  await openChange(page);
  const chip = page.locator(".review-chip.kind-phab").filter({ hasText: "Why THIRTY?" });
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await chip.click();
  const thread = page.getByTestId("phab-panel");
  await expect(thread.getByTestId("phab-epoch")).toHaveCount(0);
  await amendWith(dir, { insertAfter27: true });
  const toast = page.getByTestId(/^toast-revision:/);
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await toast.getByRole("button", { name: "Update" }).click();
  await expect(page.getByTestId("epoch")).toHaveText("Epoch 2");
  await expect(page.getByTestId("change-c3")).toBeVisible({ timeout: 30_000 });
  await openChange(page);
  await page.locator(".review-chip.kind-phab").filter({ hasText: "Why THIRTY?" }).click();
  await expect(thread).toContainText("Why THIRTY?");
  await expect(thread.getByTestId("phab-epoch")).toHaveText("epoch 1");
  await expect(thread).toContainText("a.txt:31");
});

test("remote inline whose line is gone after an amend is listed as outdated", async ({ page, request }) => {
  const ids = newRevision();
  const { dir } = await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(180, "a.txt", 30, "Why THIRTY?", { diffId: ids.d1 })] }));
  await openChange(page);
  await expect(page.locator(".review-chip.kind-phab").filter({ hasText: "Why THIRTY?" })).toBeVisible({ timeout: 10_000 });
  await amendWith(dir, { replaceLine30: true });
  const toast = page.getByTestId(/^toast-revision:/);
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await toast.getByRole("button", { name: "Update" }).click();
  await expect(page.getByTestId("epoch")).toHaveText("Epoch 2");
  await openPatch(page, 0);
  await expect(page.getByTestId("change-c3")).toBeVisible({ timeout: 30_000 });
  const summary = page.getByTestId("summary");
  const chip = summary.locator(".review-chip.kind-phab").filter({ hasText: "Why THIRTY?" });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(page.getByTestId("phab-panel")).toContainText("alice");
  await expect(page.getByTestId("phab-panel")).toContainText("epoch 1");
});

test("comments render as Markdown; bot comments are collapsed to a preview; long comments are clamped", async ({ page, request }) => {
  const ids = newRevision();
  const longBody = Array.from({ length: 40 }, (_, i) => `Long comment line ${i + 1}`).join("\n\n");
  const botBody = "The analysis task [lint](https://example.com/lint) failed.\n\n## Details\n\nMore details.";
  await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [
    commentTx(190, botBody, "reviewbot"), commentTx(191, "This is **important** feedback"), commentTx(192, longBody),
  ] }));
  const summary = page.getByTestId("summary");
  const botChip = summary.locator(".review-chip.kind-phab").filter({ hasText: "The analysis task" });
  await botChip.click();
  const bot = page.getByTestId("phab-panel").getByTestId("phab-comment").filter({ hasText: "@reviewbot" });
  await expect(bot).toBeVisible({ timeout: 10_000 });
  await expect(bot.locator(".phab-bot")).toHaveText("bot");
  await expect(bot.locator(".phab-preview")).toHaveText("The analysis task lint failed.");
  await expect(bot.locator("a")).toHaveCount(0);
  await bot.getByLabel("Expand comment").click();
  await expect(bot.locator("h2")).toHaveText("Details");
  const link = bot.locator("a");
  await expect(link).toHaveText("lint");
  await expect(link).toHaveAttribute("target", "_blank");
  await page.getByTestId("phab-panel").getByRole("button", { name: "Close Phabricator panel" }).click();
  await summary.locator(".review-chip.kind-phab").filter({ hasText: "This is **important** feedback" }).click();
  const important = page.getByTestId("phab-panel").getByTestId("phab-comment").filter({ hasText: "important" });
  await expect(important.locator("strong").filter({ hasText: "important" })).toBeVisible();
  await expect(important.getByRole("button", { name: "Show more" })).toHaveCount(0);
  await page.getByTestId("phab-panel").getByRole("button", { name: "Close Phabricator panel" }).click();
  await summary.locator(".review-chip.kind-phab").filter({ hasText: "Long comment line 1" }).click();
  const long = page.getByTestId("phab-panel").getByTestId("phab-comment").filter({ hasText: "Long comment line 1" });
  await expect(long.getByRole("button", { name: "Show more" })).toBeVisible();
  await expect(long.locator(".phab-body")).toHaveClass(/clamped/);
  await long.getByRole("button", { name: "Show more" }).click();
  await expect(long.getByRole("button", { name: "Show less" })).toBeVisible();
  await expect(long.locator(".phab-body")).not.toHaveClass(/clamped/);
  await page.reload();
  await summary.locator(".review-chip.kind-phab").filter({ hasText: "The analysis task" }).click();
  await expect(page.getByTestId("phab-panel").getByTestId("phab-comment").filter({ hasText: "@reviewbot" }).locator("h2")).toHaveCount(0, { timeout: 10_000 });
});
