import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { revealNode, setLevel, startReview } from "./canvas.ts";

const repoDirs: string[] = [];
let revisionCount = 0;
const control = "http://127.0.0.1:4179/control";

test.afterEach(() => {
  for (const dir of repoDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function newStackIds(count: number) {
  const revisions = Array.from({ length: count }, () => 5000 + test.info().workerIndex * 100 + revisionCount++);
  return revisions.map((revision) => ({ revision, diff: revision * 10 + 1 }));
}

function git(dir: string, ...args: string[]) {
  return execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();
}

function writeLines(dir: string, values: string[]) {
  writeFileSync(join(dir, "a.txt"), `${values.join("\n")}\n`);
}

type StackCommit = { revision: number; subject: string; apply: (dir: string) => void };

async function buildStack(request: APIRequestContext, commits: StackCommit[]) {
  const dir = mkdtempSync(join(tmpdir(), "spatial-stack-"));
  repoDirs.push(dir);
  git(dir, "init", "-b", "main");
  writeLines(dir, Array.from({ length: 60 }, (_, i) => `line ${i + 1}`));
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "base");
  const base = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-b", "feature");
  const ids = commits.map((commit) => ({ revision: commit.revision, diff: commit.revision * 10 + 1 }));
  let parent = base;
  const rawDiffs: string[] = [];
  for (const [index, item] of commits.entries()) {
    item.apply(dir);
    git(dir, "add", "-A");
    git(dir, "commit", "-m", item.subject, "-m", `Differential Revision: https://phab.example.com/D${item.revision}`);
    const sha = git(dir, "rev-parse", "HEAD");
    rawDiffs.push(git(dir, "diff", parent, sha));
    parent = sha;
    const response = await request.post(control, { data: { revision: ids[index]!.revision, diffs: [ids[index]!.diff], rawDiffs: { [ids[index]!.diff]: rawDiffs[index] } } });
    expect(response.ok()).toBeTruthy();
  }
  return { dir, base, ids, rawDiffs };
}

async function narrate(page: Page, stack: Awaited<ReturnType<typeof buildStack>>, level: "code" | "concept") {
  const sessionId = await startReview(page, stack.dir, `${stack.base}..feature`);
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  await setLevel(page, level);
  await expect(page.getByTestId("change-c1")).toHaveAttribute("data-level", level);
  return sessionId;
}

async function reviewAndPost(page: Page, revision: number) {
  const finding = page.locator(".finding-node");
  await expect(finding).toBeVisible({ timeout: 15_000 });
  await finding.getByLabel("Accept finding").click();
  await expect(finding.getByLabel("Comment")).toHaveValue("No test was added for the c.txt change.", { timeout: 10_000 });
  // The grown comment box can push Save under a neighbouring node, which would take a pointer click.
  await finding.getByRole("button", { name: "Save" }).press("Enter");
  const summary = page.getByTestId("summary");
  const post = summary.getByRole("button", { name: `Post 1 draft to D${revision}` });
  await expect(post).toBeVisible({ timeout: 10_000 });
  await post.click();
  await expect(summary.locator(".post-result")).toContainText(`D${revision}`);
  return { finding, summary };
}

async function state(request: APIRequestContext, sessionId: string) {
  return await (await request.get(`http://127.0.0.1:4178/api/sessions/${sessionId}/state`)).json() as { artifacts: { type: string; data: Record<string, unknown>; provenance: { taskId: string } }[] };
}

async function inlines(request: APIRequestContext, revision: number) {
  return await (await request.get(`${control}/inlines?revision=${revision}`)).json() as { revisionID: number; diffID: number; filePath: string }[];
}

function inlineTx(id: number, revision: number, diffId: number, path: string, line: number, body: string) {
  return { id, phid: `PHID-XACT-${id}`, type: "inline", authorPHID: "PHID-USER-alice", objectPHID: `PHID-DREV-${revision}`, dateCreated: id, dateModified: id, groupID: null, comments: [{ id: id + 100, phid: `PHID-XCMT-${id}`, version: 1, authorPHID: "PHID-USER-alice", dateCreated: id - 1, dateModified: id, removed: false, content: { raw: body } }], fields: { diff: { id: diffId, phid: `PHID-DIFF-${diffId}` }, path, line, length: 1, isNewFile: true, replyToCommentPHID: null, isDone: false, hasSuggestion: false, suggestionText: null } };
}

function changeLine(dir: string, value: string) {
  const lines = readFileSync(join(dir, "a.txt"), "utf8").trimEnd().split("\n");
  lines[29] = value;
  writeLines(dir, lines);
}

function firstCommit(revision: number, includeReviewRoute = false): StackCommit {
  return {
    revision,
    subject: "First stack change",
    apply: (dir) => {
      changeLine(dir, "THIRTY");
      writeFileSync(join(dir, "c.txt"), includeReviewRoute ? "c\nROUTE-UPDATE-REVIEW\n" : "c\n");
    },
  };
}

test("stack lines show their commit colors and later rewrite", async ({ page, request }) => {
  const ids = newStackIds(2);
  const stack = await buildStack(request, [
    { ...firstCommit(ids[0]!.revision), revision: ids[0]!.revision },
    { revision: ids[1]!.revision, subject: "Rewrite line", apply: (dir) => changeLine(dir, "THIRTY-TWO") },
  ]);
  const sessionId = await narrate(page, stack, "concept");
  const summary = page.getByTestId("summary");
  await expect(summary.locator("li .swatch")).toHaveCount(2);
  await expect(summary).toContainText("C1");
  await expect(summary).toContainText("First stack change");
  await expect(summary).toContainText("C2");
  await expect(summary).toContainText("Rewrite line");
  await revealNode(page, "change-c1");
  await setLevel(page, "code");
  const rewritten = page.getByTestId("hunk-f0h1");
  await revealNode(page, rewritten);
  await expect(rewritten.getByTestId("rewrite-flag")).toHaveText("C2 rewrites 1 line added in C1");
  const latest = rewritten.locator("tr.add").filter({ hasText: "THIRTY-TWO" });
  await expect(latest).toHaveAttribute("data-commit", "1");
  const latestColor = await latest.locator("td.sign").evaluate((element) => getComputedStyle(element).backgroundColor);
  await expect(page.getByTestId("change-c3").locator(".title > .commit-tag")).toHaveText("C2");
  await page.getByTestId("guide").getByRole("button", { name: "Next step" }).click();
  await expect(page.locator(".react-flow__node.guide-current").getByTestId("change-c1")).toBeVisible();
  await page.getByTestId("hunk-f0h0").getByRole("button", { name: "a.txt", exact: true }).click();
  const panel = page.getByTestId("file-panel");
  await expect(panel.locator('tr[data-commit="0"]')).toHaveCount(1);
  await expect(panel.locator('tr[data-commit="1"]')).toHaveCount(1);
  await expect(page.getByTestId("hunk-f0h0").locator("tr.del")).toHaveAttribute("data-commit", "0");
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  const early = page.getByTestId("hunk-f1h0").locator("tr.add");
  await expect(early).toHaveAttribute("data-commit", "0");
  const diff = (await state(request, sessionId)).artifacts.find((artifact) => artifact.type === "Diff")!.data;
  const firstSha = (diff.commits as { sha: string }[])[0]!.sha.slice(0, 7);
  await expect(early.locator("td.sign")).toHaveAttribute("title", new RegExp(firstSha));
  const earlyColor = await early.locator("td.sign").evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(latestColor).not.toBe(earlyColor);
});

test("a comment on the first stack revision anchors to its commit line", async ({ page, request }) => {
  const ids = newStackIds(2);
  const stack = await buildStack(request, [
    { ...firstCommit(ids[0]!.revision), revision: ids[0]!.revision },
    { revision: ids[1]!.revision, subject: "Rewrite line", apply: (dir) => changeLine(dir, "THIRTY-TWO") },
  ]);
  const response = await request.post(control, { data: { revision: ids[0]!.revision, transactions: [inlineTx(7000 + revisionCount, ids[0]!.revision, ids[0]!.diff, "c.txt", 1, "Why c?")] } });
  expect(response.ok()).toBeTruthy();

  const sessionId = await narrate(page, stack, "code");
  await expect.poll(async () => (await state(request, sessionId)).artifacts.some((artifact) => artifact.type === "PhabComment"), { timeout: 10_000 }).toBe(true);
  const thread = page.getByTestId("phab-thread").filter({ hasText: "Why c?" });
  await revealNode(page, thread);
  await expect(thread).toContainText("c.txt:1");
  await revealNode(page, "summary");
  await expect(page.getByTestId("summary")).not.toContainText("Phabricator comments");
});

test("commits are lanes; the guide walks the reading path and records reviews", async ({ page, request }) => {
  const ids = newStackIds(2);
  const stack = await buildStack(request, [
    { revision: ids[0]!.revision, subject: "First stack change", apply: (dir) => changeLine(dir, "THIRTY") },
    { revision: ids[1]!.revision, subject: "Add c", apply: (dir) => writeFileSync(join(dir, "c.txt"), "c\n") },
  ]);
  const sessionId = await narrate(page, stack, "concept");
  const lane0 = page.getByTestId("commit-0"), lane1 = page.getByTestId("commit-1");
  const guide = page.getByTestId("guide");
  const current = page.locator(".react-flow__node.guide-current");
  await expect(guide).toContainText("Start here");
  await expect(guide).toContainText("Edit a");
  await guide.getByRole("button", { name: "Next step" }).click();
  await expect(current.getByTestId("change-c1")).toBeVisible();
  await expect(page.getByTestId("change-c1")).toBeInViewport();
  await page.locator(".canvas").focus();
  await page.keyboard.press("n");
  await expect(current.getByTestId("change-c2")).toBeVisible();
  await expect(guide).toContainText("Step 2/2");
  await expect(page.getByTestId("change-c2")).toBeInViewport();
  await expect(page.getByTestId("change-c2").locator(".commit-tag")).toHaveText("C2");
  await guide.getByRole("button", { name: "Previous step" }).click();
  await expect(current.getByTestId("change-c1")).toBeVisible();
  await expect(page.getByTestId("change-c1").locator(".commit-tag")).toHaveText("C1");

  await guide.getByRole("button", { name: "Toggle reviewed" }).click();
  await expect(guide.getByTestId("guide-progress")).toHaveText("1/2 reviewed");
  await expect(page.getByLabel("Reviewed c1")).toBeChecked();
  const reviews = (await state(request, sessionId)).artifacts.filter((artifact) => artifact.type === "ChangeReview");
  expect(reviews.map((artifact) => [artifact.data.change, artifact.data.reviewed, artifact.provenance.taskId])).toEqual([["c1", true, "user"]]);

  await page.reload();
  await expect(guide).toContainText("Step 1/2", { timeout: 15_000 });
  await expect(guide).toContainText("Edit a");
  await expect(guide.getByTestId("guide-progress")).toHaveText("1/2 reviewed");
  await setLevel(page, "patch", "commit-0");
  await expect(page.getByTestId("change-c1")).toHaveCount(0);
  await expect(lane0).toContainText("C1");
  await expect(lane0).toContainText("First stack change");
  await expect(lane0).toContainText("Replaces line 30 with THIRTY");
  await expect(lane0.getByTestId("commit-counts")).toContainText("1/1 reviewed");
  await expect(lane1).toContainText("Add c");
  await expect(lane1.getByTestId("commit-counts")).toContainText("0/1 reviewed");
  expect((await lane0.boundingBox())!.x).toBeLessThan((await lane1.boundingBox())!.x);
  await guide.getByRole("button", { name: "Next step" }).click();
  await expect(current.getByTestId("commit-1")).toBeVisible();
});

test("ask for a structure diagram from a commit card", async ({ page, request }) => {
  const ids = newStackIds(2);
  const stack = await buildStack(request, [
    { ...firstCommit(ids[0]!.revision), revision: ids[0]!.revision },
    { revision: ids[1]!.revision, subject: "Rewrite line", apply: (dir) => changeLine(dir, "THIRTY-TWO") },
  ]);
  await narrate(page, stack, "code");
  const firstCard = page.getByTestId("commit-0");
  await revealNode(page, firstCard);
  await firstCard.getByRole("button", { name: "Ask about commit 1" }).click();
  const draft = page.locator('[data-testid^="chat-draft-"]').filter({ has: page.getByLabel("message") }).last();
  await revealNode(page, draft);
  await draft.getByLabel("message").fill("DIAGRAM-PLEASE");
  await draft.getByRole("button", { name: "Send" }).click();
  const answer = page.locator(".chat-node .msg.assistant").filter({ hasText: "Here is the sequence." });
  await expect(answer).toBeVisible({ timeout: 15_000 });
  const diagram = page.locator('[data-testid^="diagram-"]');
  await expect(diagram.getByRole("button", { name: "Collapse" })).toBeVisible();
  const pane = page.locator(".react-flow");
  const paneBox = (await pane.boundingBox())!;
  const diagramBox = (await diagram.boundingBox())!;
  expect(diagramBox.x).toBeGreaterThanOrEqual(paneBox.x);
  expect(diagramBox.x + diagramBox.width).toBeLessThanOrEqual(paneBox.x + paneBox.width);
  expect(diagramBox.y).toBeGreaterThanOrEqual(paneBox.y);
  expect(diagramBox.y + diagramBox.height).toBeLessThanOrEqual(paneBox.y + paneBox.height);
  await expect(diagram).toContainText("3 steps · 1 unverified");
  await expect(diagram.locator('.sequence-step[data-verified="true"]')).toHaveCount(2);
  await expect(diagram.locator('.sequence-step[data-verified="false"]')).toHaveCount(1);
  await expect(diagram.locator('.sequence-step[data-status="changed"]')).toHaveCount(1);
  await expect(diagram.locator('.sequence-step[data-status="new"]')).toHaveCount(1);
  await expect(diagram.locator('.sequence-step[data-status="existing"]')).toHaveCount(1);
  const changedStep = diagram.locator('button.sequence-step[data-status="changed"]');
  await expect(changedStep).toHaveCount(1);
  await changedStep.click();
  await expect(page.locator("tr.focus")).toHaveCount(1);
  await expect(page.getByTestId("change-c2").locator('tr.focus[data-new="1"]')).toBeInViewport();
  const sessionUrl = page.url();
  await page.goBack();
  expect(page.url()).toBe(sessionUrl);
  await expect(page.locator("tr.focus")).toHaveCount(0);
  await expect(changedStep).toBeInViewport();
  await page.goForward();
  await expect(page.getByTestId("change-c2").locator('tr.focus[data-new="1"]')).toBeInViewport();
  await expect(diagram.locator('button.sequence-step[data-status="existing"]')).toHaveCount(0);
  const toggle = diagram.locator(".diagram-toggle");
  await revealNode(page, toggle);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(diagram.locator(".sequence-step")).toHaveCount(1);
  await expect(diagram.locator('.sequence-step[data-status="removed"]')).toHaveCount(1);
  await diagram.getByRole("button", { name: "Show flow after this commit" }).click();
  await expect(diagram.locator(".sequence-step")).toHaveCount(3);
  const content = diagram.locator(".diagram-content");
  expect(await content.evaluate((element) => element.scrollWidth)).toBe(await content.evaluate((element) => element.clientWidth));
  const collapseDiagram = diagram.getByRole("button", { name: "Collapse" });
  await revealNode(page, collapseDiagram);
  await collapseDiagram.click();
  await expect(diagram.locator(".sequence-step")).toHaveCount(0);
  const showDiagram = answer.getByRole("button", { name: "Show diagram" });
  await revealNode(page, showDiagram);
  await showDiagram.click();
  await expect(diagram.getByRole("button", { name: "Collapse" })).toBeVisible();
  await expect(diagram.locator('.sequence-step[data-verified="true"]')).toHaveCount(2);
  const revealedBox = (await diagram.boundingBox())!;
  expect(revealedBox.x).toBeGreaterThanOrEqual(paneBox.x);
  expect(revealedBox.x + revealedBox.width).toBeLessThanOrEqual(paneBox.x + paneBox.width);
  expect(revealedBox.y).toBeGreaterThanOrEqual(paneBox.y);
  expect(revealedBox.y + revealedBox.height).toBeLessThanOrEqual(paneBox.y + paneBox.height);
  expect(Math.abs(revealedBox.x + revealedBox.width / 2 - (paneBox.x + paneBox.width / 2))).toBeLessThan(2);
  expect(Math.abs(revealedBox.y + revealedBox.height / 2 - (paneBox.y + paneBox.height / 2))).toBeLessThan(2);
  await diagram.getByRole("button", { name: "Close" }).click();
  await expect(diagram).toHaveCount(0);
  await revealNode(page, showDiagram);
  await showDiagram.click();
  await expect(diagram.getByRole("button", { name: "Collapse" })).toBeVisible();
});

test("posts a C1 line to C1", async ({ page, request }) => {
  const ids = newStackIds(2);
  const stack = await buildStack(request, [
    { ...firstCommit(ids[0]!.revision), revision: ids[0]!.revision },
    { revision: ids[1]!.revision, subject: "Rewrite line", apply: (dir) => changeLine(dir, "THIRTY-TWO") },
  ]);
  const sessionId = await narrate(page, stack, "concept");
  await reviewAndPost(page, ids[0]!.revision);
  const posted = (await state(request, sessionId)).artifacts.filter((artifact) => artifact.type === "PostedComment");
  expect(posted).toHaveLength(1);
  expect(posted[0]!.data.revision).toBe(ids[0]!.revision);
  expect(posted[0]!.data.diff).toBe(ids[0]!.diff);
  await expect.poll(async () => inlines(request, ids[0]!.revision)).toHaveLength(1);
  expect(await inlines(request, ids[0]!.revision)).toEqual([{ revisionID: ids[0]!.revision, diffID: ids[0]!.diff, filePath: "c.txt", isNewFile: 1, lineNumber: expect.any(Number), lineLength: expect.any(Number), content: expect.any(String) }]);
  expect(await inlines(request, ids[1]!.revision)).toEqual([]);
});

test("posts a C2 line to C2", async ({ page, request }) => {
  const ids = newStackIds(2);
  const stack = await buildStack(request, [
    { revision: ids[0]!.revision, subject: "First stack change", apply: (dir) => changeLine(dir, "THIRTY") },
    { revision: ids[1]!.revision, subject: "Add c", apply: (dir) => writeFileSync(join(dir, "c.txt"), "c\n") },
  ]);
  const sessionId = await narrate(page, stack, "concept");
  await reviewAndPost(page, ids[1]!.revision);
  const posted = (await state(request, sessionId)).artifacts.filter((artifact) => artifact.type === "PostedComment");
  expect(posted).toHaveLength(1);
  expect(posted[0]!.data.revision).toBe(ids[1]!.revision);
  expect(posted[0]!.data.diff).toBe(ids[1]!.diff);
  await expect.poll(async () => inlines(request, ids[1]!.revision)).toHaveLength(1);
  expect((await inlines(request, ids[1]!.revision))[0]).toMatchObject({ revisionID: ids[1]!.revision, diffID: ids[1]!.diff, filePath: "c.txt" });
  expect(await inlines(request, ids[0]!.revision)).toEqual([]);
});

test("drift blocks posting without poisoning a later retry", async ({ page, request }) => {
  const ids = newStackIds(2);
  const stack = await buildStack(request, [
    { revision: ids[0]!.revision, subject: "First stack change", apply: (dir) => changeLine(dir, "THIRTY") },
    { revision: ids[1]!.revision, subject: "Add c", apply: (dir) => writeFileSync(join(dir, "c.txt"), "c\nROUTE-UPDATE-REVIEW\n") },
  ]);
  await narrate(page, stack, "concept");
  const finding = page.locator(".finding-node").filter({ hasText: "Magic number" });
  await expect(finding).toBeVisible({ timeout: 15_000 });
  await finding.getByLabel("Accept finding").click();
  await expect(finding.getByLabel("Comment")).toHaveValue("No test was added for the c.txt change.", { timeout: 10_000 });
  await finding.getByRole("button", { name: "Save" }).click();
  const summary = page.getByTestId("summary");
  const post = summary.getByRole("button", { name: `Post 1 draft to D${ids[0]!.revision}` });
  await expect(post).toBeVisible({ timeout: 10_000 });

  const drifted = stack.rawDiffs[0]!.replace("THIRTY", "THIRTY-X");
  const driftUpdate = await request.post(control, { data: { revision: ids[0]!.revision, diffs: [ids[0]!.diff + 1, ids[0]!.diff], rawDiffs: { [ids[0]!.diff + 1]: drifted, [ids[0]!.diff]: stack.rawDiffs[0] } } });
  expect(driftUpdate.ok()).toBeTruthy();
  await post.click();
  await expect(summary.locator(".post-error")).toContainText(`D${ids[0]!.revision}`);
  expect(await inlines(request, ids[0]!.revision)).toEqual([]);

  const restore = await request.post(control, { data: { revision: ids[0]!.revision, diffs: [ids[0]!.diff], rawDiffs: { [ids[0]!.diff]: stack.rawDiffs[0] } } });
  expect(restore.ok()).toBeTruthy();
  await post.click();
  await expect(finding).toContainText(`Posted to D${ids[0]!.revision}`);
  await expect.poll(async () => inlines(request, ids[0]!.revision)).toHaveLength(1);
});
