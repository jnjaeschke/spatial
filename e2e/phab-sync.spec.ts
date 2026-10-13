import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, writeLines, inlineTx, makeRepo } from "./repo.ts";
import { test, expect, type Page, type APIRequestContext, type Locator } from "@playwright/test";
import { expandItem, openChange, openInPanel, openPatch, revealNode, startReview } from "./canvas.ts";
import { newRevision } from "./revisions.ts";

const repoDirs: string[] = [];
const control = "http://127.0.0.1:4179/control";

test.afterEach(() => {
  for (const dir of repoDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function commentTx(id: number, body: string, author = "alice", replyTo?: string) {
  return { id, phid: `PHID-XACT-${id}`, type: "comment", authorPHID: `PHID-USER-${author}`, objectPHID: "PHID-DREV-1", dateCreated: id, dateModified: id, groupID: null, comments: [{ id: id + 100, phid: `PHID-XCMT-${id}`, version: 1, authorPHID: `PHID-USER-${author}`, dateCreated: id, dateModified: id, removed: false, content: { raw: body } }], fields: replyTo ? { replyToCommentPHID: replyTo } : {} };
}

async function configure(request: APIRequestContext, revision: number, value: object) {
  const response = await request.post(control, { data: { revision, ...value } });
  expect(response.ok()).toBeTruthy();
}

/** Configures the fake Conduit before the session opens: the syncer caches raw diffs, as they never change on Phabricator. */
async function openNarratedWithTrailer(page: Page, request: APIRequestContext, revision: number, conduit: (diff: string) => object) {
  const dir = makeRepo("spatial-phab-", { "a.txt": `${Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n")}\n` });
  repoDirs.push(dir);
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
  const item = page.locator(".inline-item.kind-phab").filter({ hasText: "Why THIRTY?" });
  await expect(item).toBeVisible({ timeout: 10_000 });
  await expect(item.locator(".inline-who")).toHaveText("@alice");
  await expect(item).toContainText("@alice: Why THIRTY?");
  await expandItem(item);
  await expect(item).toContainText("alice");
  await expect(page.getByTestId("phab-panel")).toHaveCount(0);
  await expect(page.getByTestId(/^toast-phab-comments:/)).toContainText("1 new comment");
});

test("old-side inline is listed unanchored", async ({ page, request }) => {
  const ids = newRevision();
  await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(130, "a.txt", 30, "Old side note", { diffId: ids.d1, isNewFile: false })] }));
  const summary = page.getByTestId("summary");
  const item = summary.locator(".inline-item.kind-phab").filter({ hasText: "Old side note" });
  await expect(item).toBeVisible({ timeout: 10_000 });
  await expandItem(item);
  await expect(item).toContainText("alice");
});

test("done thread is collapsed and follows isDone", async ({ page, request }) => {
  const ids = newRevision();
  const initial = [inlineTx(140, "a.txt", 30, "Finished", { diffId: ids.d1, isDone: true, phid: "PHID-XCMT-DONE" }), inlineTx(141, "a.txt", 31, "Still open", { diffId: ids.d1, phid: "PHID-XCMT-OPEN" })];
  const { diff } = await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: initial }));
  await openChange(page);
  const done = page.locator(".inline-item.kind-phab").filter({ hasText: "Finished" });
  await expect(done).toHaveClass(/dismissed/, { timeout: 10_000 });
  const open = page.locator(".inline-item.kind-phab").filter({ hasText: "Still open" });
  await expect(open).not.toHaveClass(/dismissed/);
  await expandItem(done);
  await expect(done.locator(".phab-detail-location .phab-done")).toBeVisible();
  initial[1].fields.isDone = true;
  await configure(request, ids.revision, { diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: initial });
  await expect(open).toHaveClass(/dismissed/, { timeout: 10_000 });
});

test("inline on a non-matching diff goes to the summary list", async ({ page, request }) => {
  const ids = newRevision();
  await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d2, ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(150, "a.txt", 30, "Different patch", { diffId: ids.d2 })] }));
  const item = page.getByTestId("summary").locator(".inline-item.kind-phab").filter({ hasText: "Different patch" });
  await expect(item).toBeVisible({ timeout: 10_000 });
  await openInPanel(item);
  await expect(page.getByTestId("phab-panel")).toContainText("alice");
});

test("ask about a remote comment: chat inside the thread node", async ({ page, request }) => {
  const ids = newRevision();
  await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(160, "a.txt", 30, "Why is this needed?", { diffId: ids.d1 })] }));
  await openChange(page);
  const thread = page.locator(".inline-item.kind-phab").filter({ hasText: "Why is this needed?" });
  await expect(thread).toBeVisible({ timeout: 10_000 });
  await expandItem(thread);
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
  const thread = page.locator(".inline-item.kind-phab").filter({ hasText: "Why THIRTY?" });
  await expect(thread).toBeVisible({ timeout: 10_000 });
  await expandItem(thread);
  await expect(thread.getByTestId("phab-epoch")).toHaveCount(0);
  await amendWith(dir, { insertAfter27: true });
  const toast = page.getByTestId(/^toast-revision:/);
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await toast.getByRole("button", { name: "Update" }).click();
  await expect(page.getByTestId("epoch")).toHaveText("Epoch 2");
  await openPatch(page, 0);
  await expect(page.getByTestId("change-c3")).toBeVisible({ timeout: 30_000 });
  await openChange(page);
  await expandItem(thread);
  await expect(thread).toContainText("Why THIRTY?");
  await expect(thread.getByTestId("phab-epoch")).toHaveText("epoch 1");
  await expect(thread).toContainText("a.txt:31");
});

test("remote inline whose line is gone after an amend is listed as outdated", async ({ page, request }) => {
  const ids = newRevision();
  const { dir } = await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(180, "a.txt", 30, "Why THIRTY?", { diffId: ids.d1 })] }));
  await openChange(page);
  await expect(page.locator(".inline-item.kind-phab").filter({ hasText: "Why THIRTY?" })).toBeVisible({ timeout: 10_000 });
  await amendWith(dir, { replaceLine30: true });
  const toast = page.getByTestId(/^toast-revision:/);
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await toast.getByRole("button", { name: "Update" }).click();
  await expect(page.getByTestId("epoch")).toHaveText("Epoch 2");
  await openPatch(page, 0);
  await expect(page.getByTestId("change-c3")).toBeVisible({ timeout: 30_000 });
  const summary = page.getByTestId("summary");
  const item = summary.locator(".inline-item.kind-phab").filter({ hasText: "Why THIRTY?" });
  await expect(item).toBeVisible();
  await expandItem(item);
  await expect(item).toContainText("alice");
  await expect(item).toContainText("epoch 1");
  await openInPanel(item);
  await expect(page.getByTestId("phab-panel")).toContainText("alice");
  await expect(page.getByTestId("phab-panel")).toContainText("epoch 1");
});

test("comments render as Markdown with images as links; bot comments are collapsed to a preview; long comments are clamped", async ({ page, request }) => {
  const ids = newRevision();
  const longBody = Array.from({ length: 40 }, (_, i) => `Long comment line ${i + 1}`).join("\n\n");
  const botBody = "The analysis task [lint](https://example.com/lint) failed.\n\n## Details\n\nMore details.";
  await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [
    commentTx(190, botBody, "reviewbot"), commentTx(191, "This is **important** feedback ![tracker](https://example.com/pixel.png)"), commentTx(192, longBody),
  ] }));
  const summary = page.getByTestId("summary");
  const phab = (text: string) => summary.locator(".inline-item.kind-phab").filter({ hasText: text });
  const botItem = phab("The analysis task");
  await expect(botItem).toContainText("@reviewbot: The analysis task lint failed. Details More details.");
  await expandItem(botItem);
  const bot = botItem.getByTestId("phab-comment").filter({ hasText: "@reviewbot" });
  await expect(bot).toBeVisible({ timeout: 10_000 });
  await expect(bot.locator(".phab-bot")).toHaveText("bot");
  await expect(bot.locator(".phab-preview")).toHaveText("The analysis task lint failed.");
  await expect(bot.locator("a")).toHaveCount(0);
  await bot.getByLabel("Expand comment").click();
  await expect(bot.locator("h2")).toHaveText("Details");
  const link = bot.locator("a");
  await expect(link).toHaveText("lint");
  await expect(link).toHaveAttribute("target", "_blank");
  await botItem.getByRole("button", { name: "Collapse item" }).click();
  const importantItem = phab("important feedback");
  await expandItem(importantItem);
  const important = importantItem.getByTestId("phab-comment").filter({ hasText: "important" });
  await expect(important.locator("strong").filter({ hasText: "important" })).toBeVisible();
  await expect(important.locator("img")).toHaveCount(0);
  await expect(important.getByRole("link", { name: "tracker" })).toHaveAttribute("href", "https://example.com/pixel.png");
  await expect(important.getByRole("button", { name: "Show more" })).toHaveCount(0);
  await importantItem.getByRole("button", { name: "Collapse item" }).click();
  const longItem = phab("Long comment line 1");
  await expandItem(longItem);
  const long = longItem.getByTestId("phab-comment").filter({ hasText: "Long comment line 1" });
  await expect(long.getByRole("button", { name: "Show more" })).toBeVisible();
  await expect(long.locator(".phab-body")).toHaveClass(/clamped/);
  await long.getByRole("button", { name: "Show more" }).click();
  await expect(long.getByRole("button", { name: "Show less" })).toBeVisible();
  await expect(long.locator(".phab-body")).not.toHaveClass(/clamped/);
  await page.reload();
  await expandItem(phab("The analysis task"));
  await expect(phab("The analysis task").getByTestId("phab-comment").filter({ hasText: "@reviewbot" }).locator("h2")).toHaveCount(0, { timeout: 10_000 });
});

test("Phabricator summaries appear for four comments; shorter threads preview the last author and comment", async ({ page, request }) => {
  const ids = newRevision();
  const reply = (id: number, body: string, author: string, root: number) => inlineTx(id, "a.txt", 30, body, { diffId: ids.d1, author, replyTo: `PHID-XCMT-${root}` });
  await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [
    inlineTx(250, "a.txt", 30, "SUMMARY-E2E-THREAD: should name the issue", { diffId: ids.d1 }),
    reply(251, "The implementation misses one case", "bob", 250),
    reply(252, "I have fixed that case", "alice", 251),
    reply(253, "Agreed, this resolves it", "bob", 252),
    inlineTx(260, "a.txt", 30, "Two comment opener", { diffId: ids.d1 }),
    reply(261, "Short thread last word", "bob", 260),
  ] }));
  await openChange(page);
  const resolved = page.locator(".inline-item.kind-phab").filter({ hasText: "AI summary" });
  await expect(resolved).toContainText("The reviewers question the implementation, then agree the change addresses the concern.", { timeout: 15_000 });
  await expect(resolved.locator(".inline-who")).toHaveText("@alice, @bob");
  await expect(resolved.locator(".inline-count")).toHaveText("4");
  const short = page.locator(".inline-item.kind-phab").filter({ hasText: "Short thread last word" });
  await expect(short).toContainText("@bob: Short thread last word");
  await expect(short.locator(".inline-count")).toHaveText("2");
  await expect(short).not.toContainText("AI summary");
  await expandItem(resolved);
  await expect(resolved.locator(".phab-thread-summary")).toContainText("The reviewers question the implementation");
  await openInPanel(resolved);
  await expect(page.getByTestId("phab-panel").locator(".phab-thread-summary")).toContainText("AI summary");
});

const inlinesOf = async (request: APIRequestContext, revision: number) => await (await request.get(`http://127.0.0.1:4179/control/inlines?revision=${revision}`)).json() as { filePath: string; lineNumber: number; isNewFile: number; content: string }[];
const submissionsOf = async (request: APIRequestContext, revision: number) => await (await request.get(`http://127.0.0.1:4179/control/submissions?revision=${revision}`)).json() as { message: string; attach_inlines: boolean }[];

async function submitReview(page: Page, revision: number): Promise<Locator> {
  await openPatch(page, 0);
  await revealNode(page, "summary");
  const panel = page.getByTestId(`review-panel-D${revision}`);
  if (await panel.getByLabel("General comment").count() === 0) await panel.getByRole("button", { name: `Expand review D${revision}` }).click();
  return panel;
}

async function confirmSubmit(page: Page, panel: Locator, revision: number) {
  await panel.getByRole("button", { name: `Submit to D${revision}…` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
}

test("a reply to an inline thread, drafted from the chat, is posted as an inline on Submit only", async ({ page, request }) => {
  const ids = newRevision();
  await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [inlineTx(300, "a.txt", 30, "DRAFT-REPLY-E2E why THIRTY?", { diffId: ids.d1 })] }));
  await openChange(page);
  const thread = page.locator(".inline-item.kind-phab").filter({ hasText: "DRAFT-REPLY-E2E" });
  await expect(thread).toBeVisible({ timeout: 10_000 });
  await expandItem(thread);
  await expect(thread.getByRole("button", { name: "Draft reply from chat" })).toHaveCount(0);
  await thread.getByLabel("message").fill("Is the name needed?");
  await thread.getByRole("button", { name: "Send" }).click();
  await expect(thread).toContainText("Stub answer.", { timeout: 15_000 });
  await thread.getByRole("button", { name: "Draft reply from chat" }).click();
  const composer = thread.getByLabel("Reply to Phabricator thread");
  await expect(composer).toHaveValue("Thanks, I will name the constant.", { timeout: 15_000 });
  await expect(composer).toHaveAttribute("placeholder", "Posted on this line when you submit");
  await expect(thread.getByTestId("user-comment")).toHaveCount(0);
  await composer.fill("Will name it.");
  await thread.getByRole("button", { name: "Save reply" }).click();
  const saved = thread.getByTestId("user-comment");
  await expect(saved).toContainText("Will name it.");
  await expect(thread.getByLabel("Reply to Phabricator thread")).toHaveCount(0);
  expect(await inlinesOf(request, ids.revision)).toEqual([]);
  expect(await submissionsOf(request, ids.revision)).toEqual([]);

  const panel = await submitReview(page, ids.revision);
  await expect(panel).toContainText("1 inline comment pending");
  await confirmSubmit(page, panel, ids.revision);
  await expect(panel.getByText(`Submitted to D${ids.revision}: 1 inline comment`)).toBeVisible({ timeout: 10_000 });
  expect(await inlinesOf(request, ids.revision)).toMatchObject([{ filePath: "a.txt", lineNumber: 30, isNewFile: 1, content: "Will name it." }]);
  expect(await submissionsOf(request, ids.revision)).toMatchObject([{ attach_inlines: true }]);
  await openChange(page);
  await expect(thread.getByTestId("user-comment")).toContainText(`Posted to D${ids.revision}`);
});

test("a reply to a general comment is quoted in the general review comment and submitted with it", async ({ page, request }) => {
  const ids = newRevision();
  await openNarratedWithTrailer(page, request, ids.revision, (diff) => ({ diffs: [ids.d1], rawDiffs: { [ids.d1]: diff }, transactions: [commentTx(310, "General question?\nMore text.")] }));
  const item = page.getByTestId("summary").locator(".inline-item.kind-phab").filter({ hasText: "General question?" });
  await expect(item).toBeVisible({ timeout: 10_000 });
  await expandItem(item);
  const panel = page.getByTestId(`review-panel-D${ids.revision}`);
  await panel.getByRole("button", { name: `Expand review D${ids.revision}` }).click();
  await panel.getByLabel("General comment").fill("Overall fine.");
  await item.getByRole("button", { name: "Reply", exact: true }).click();
  const composer = item.getByLabel("Reply to Phabricator thread");
  await expect(composer).toHaveAttribute("placeholder", "Added to your review comment when you submit");
  await composer.fill("It is by design.");
  await item.getByRole("button", { name: "Save reply" }).click();
  const quoted = "Overall fine.\n\n> @alice: General question?\n\nIt is by design.";
  await expect(panel.getByLabel("General comment")).toHaveValue(quoted);
  await expect(item.getByTestId("user-comment")).toHaveCount(0);
  expect(await submissionsOf(request, ids.revision)).toEqual([]);
  expect(await inlinesOf(request, ids.revision)).toEqual([]);
  await confirmSubmit(page, panel, ids.revision);
  await expect(panel.getByText(`Submitted to D${ids.revision}: 0 inline comments`)).toBeVisible({ timeout: 10_000 });
  expect(await submissionsOf(request, ids.revision)).toMatchObject([{ message: quoted }]);
  await expect(panel.getByLabel("General comment")).toHaveValue("");
  await page.reload();
  await expect.poll(async () => {
    const sessionId = decodeURIComponent(new URL(page.url()).pathname.split("/")[2]!);
    return JSON.stringify((await (await request.get(`http://127.0.0.1:4178/api/sessions/${sessionId}/state`)).json()).artifacts.filter((artifact: { type: string }) => artifact.type === "ReviewDraft").at(-1)?.data);
  }).toBe(JSON.stringify({ revision: ids.revision, body: "" }));
});
