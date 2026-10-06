import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

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

function commentTx(id: number, body: string) {
  return { id, phid: `PHID-XACT-${id}`, type: "comment", authorPHID: "PHID-USER-alice", objectPHID: "PHID-DREV-1", dateCreated: id, dateModified: id, groupID: null, comments: [{ id: id + 100, phid: `PHID-XCMT-${id}`, version: 1, authorPHID: "PHID-USER-alice", dateCreated: id, dateModified: id, removed: false, content: { raw: body } }], fields: {} };
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
  const title = `phab-${crypto.randomUUID()}`;
  const response = await request.post("http://127.0.0.1:4178/api/sessions", { data: { repo: dir, title } });
  expect(response.ok()).toBeTruthy();
  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: title }).click();
  await page.getByLabel("base").fill("main");
  await page.getByLabel("head").fill("feature");
  await page.getByRole("button", { name: "Narrate" }).click();
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
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
  const thread = page.getByTestId("phab-thread").filter({ hasText: "Why THIRTY?" });
  await expect(thread).toBeVisible({ timeout: 10_000 });
  await expect(thread).toContainText("alice");
  await expect(page.getByTestId(/^toast-phab-comments:/)).toContainText("1 new comment");
});

test("old-side inline is listed unanchored", async ({ page, request }) => {
  const ids = newRevision();
  await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(130, "a.txt", 30, "Old side note", { diffId: ids.d1, isNewFile: false })] }));
  await expect(page.getByTestId("phab-thread")).toHaveCount(0, { timeout: 5_000 });
  const summary = page.getByTestId("summary");
  await expect(summary).toContainText(`Phabricator comments (diff ${ids.d1}, old side)`, { timeout: 10_000 });
  await expect(summary).toContainText("alice");
});

test("done thread is collapsed and follows isDone", async ({ page, request }) => {
  const ids = newRevision();
  const initial = [inlineTx(140, "a.txt", 30, "Finished", { diffId: ids.d1, isDone: true, phid: "PHID-XCMT-DONE" }), inlineTx(141, "a.txt", 31, "Still open", { diffId: ids.d1, phid: "PHID-XCMT-OPEN" })];
  const { diff } = await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: initial }));
  const done = page.getByTestId("phab-thread").filter({ hasText: "a.txt:30" });
  await expect(done.getByText("Done")).toBeVisible({ timeout: 10_000 });
  await expect(done).not.toContainText("Finished");
  const open = page.getByTestId("phab-thread").filter({ hasText: "a.txt:31" });
  await expect(open).toContainText("Still open");
  await expect(open.getByText("Done")).toHaveCount(0);
  initial[1].fields.isDone = true;
  await configure(request, ids.revision, { diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: initial });
  await expect(open.getByText("Done")).toBeVisible({ timeout: 10_000 });
  await expect(open).not.toContainText("Still open");
});

test("inline on a non-matching diff goes to the summary list", async ({ page, request }) => {
  const ids = newRevision();
  await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d2, ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(150, "a.txt", 30, "Different patch", { diffId: ids.d2 })] }));
  await expect(page.getByTestId("phab-thread")).toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByTestId("summary")).toContainText(`Phabricator comments (diff ${ids.d2}, not matching local)`, { timeout: 10_000 });
  await expect(page.getByTestId("summary")).toContainText("alice");
});

test("ask about a remote comment: chat inside the thread node", async ({ page, request }) => {
  const ids = newRevision();
  await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(160, "a.txt", 30, "Why is this needed?", { diffId: ids.d1 })] }));
  const thread = page.getByTestId("phab-thread");
  await expect(thread).toBeVisible({ timeout: 10_000 });
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
  const thread = page.getByTestId("phab-thread");
  await expect(thread).toBeVisible({ timeout: 10_000 });
  await expect(thread.getByTestId("phab-epoch")).toHaveCount(0);
  await amendWith(dir, { insertAfter27: true });
  const toast = page.getByTestId(/^toast-revision:/);
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await toast.getByRole("button", { name: "Update" }).click();
  await expect(page.getByTestId("epoch")).toHaveText("Epoch 2");
  await expect(page.getByTestId("change-c3")).toBeVisible({ timeout: 30_000 });
  await expect(thread).toContainText("Why THIRTY?");
  await expect(thread.getByTestId("phab-epoch")).toHaveText("epoch 1");
  await expect(thread).toContainText("a.txt:31");
});

test("remote inline whose line is gone after an amend is listed as outdated", async ({ page, request }) => {
  const ids = newRevision();
  const { dir } = await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(180, "a.txt", 30, "Why THIRTY?", { diffId: ids.d1 })] }));
  await expect(page.getByTestId("phab-thread")).toBeVisible({ timeout: 10_000 });
  await amendWith(dir, { replaceLine30: true });
  const toast = page.getByTestId(/^toast-revision:/);
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await toast.getByRole("button", { name: "Update" }).click();
  await expect(page.getByTestId("epoch")).toHaveText("Epoch 2");
  await expect(page.getByTestId("change-c3")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("phab-thread")).toHaveCount(0);
  const summary = page.getByTestId("summary");
  await expect(summary).toContainText("Phabricator comments (outdated, epoch 1)");
  await expect(summary).not.toContainText("Why THIRTY?");
  await summary.getByLabel("Expand").click();
  await expect(summary).toContainText("alice");
  await expect(summary).toContainText("Why THIRTY?");
});
