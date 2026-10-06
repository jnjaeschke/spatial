import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { setLevel, startReview } from "./canvas.ts";

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
  return await (await request.get(`http://127.0.0.1:4178/api/sessions/${sessionId}/state`)).json() as { artifacts: { type: string; data: Record<string, unknown> }[] };
}

async function inlines(request: APIRequestContext, revision: number) {
  return await (await request.get(`${control}/inlines?revision=${revision}`)).json() as { revisionID: number; diffID: number; filePath: string }[];
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
  await setLevel(page, "code");
  const rewritten = page.getByTestId("hunk-f0h1");
  await expect(rewritten.getByTestId("rewrite-flag")).toHaveText("C2 rewrites 1 line added in C1");
  const latest = rewritten.locator("tr.add").filter({ hasText: "THIRTY-TWO" });
  await expect(latest).toHaveAttribute("data-commit", "1");
  await expect(page.getByTestId("hunk-f0h0").locator("tr.del")).toHaveAttribute("data-commit", "0");
  const latestColor = await latest.locator("td.sign").evaluate((element) => getComputedStyle(element).backgroundColor);
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
  await expect(summary.locator(".post-result")).toContainText(`D${ids[0]!.revision}`);
  await expect.poll(async () => inlines(request, ids[0]!.revision)).toHaveLength(1);
});
