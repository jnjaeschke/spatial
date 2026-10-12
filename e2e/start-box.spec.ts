import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoDirs: string[] = [];
let revisionCount = 50;

test.afterEach(() => {
  for (const dir of repoDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function newRevision() {
  const revision = 7000 + test.info().workerIndex * 100 + revisionCount++;
  return { revision, diff: revision * 10 + 1 };
}

function git(dir: string, ...args: string[]) {
  return execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();
}

async function openStartBox(page: Page, request: APIRequestContext): Promise<void> {
  const sessions = await (await request.get("http://127.0.0.1:4178/api/sessions")).json() as { title: string; worktree: string }[];
  const fixture = sessions.find((session) => session.title === "fixture")!;
  await page.goto(`http://127.0.0.1:4178/repo?path=${encodeURIComponent(fixture.worktree)}`);
}

test("typing / shows commands; filter, keyboard completion and Escape", async ({ page, request }) => {
  await openStartBox(page, request);
  const box = page.getByLabel("start");
  await box.fill("/");
  const list = page.getByRole("listbox", { name: "commands" });
  await expect(list.getByRole("option")).toHaveCount(4);
  await expect(list.getByRole("option").nth(0)).toContainText("/review");
  await expect(list.getByRole("option").nth(0)).toContainText("[D-number | base..head]");
  await expect(list.getByRole("option").nth(1)).toContainText("/chat");
  await expect(list.getByRole("option").nth(1)).toContainText("<message>");
  await expect(list.getByRole("option").nth(2)).toContainText("/implement");
  await expect(list.getByRole("option").nth(2)).toContainText("<what to fix or build>");
  const name = list.getByRole("option").nth(2).locator("b");
  await expect(list.getByRole("option").nth(3)).toContainText("/explore");
  await expect(list.getByRole("option").nth(3)).toContainText("<SPEC#anchor | URL | search phrase>");
  expect((await name.boundingBox())!.height).toBeLessThan(2 * await name.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)));

  await list.getByRole("option").nth(2).hover();
  await expect(list.getByRole("option").nth(2)).toHaveAttribute("aria-selected", "true");
  await list.getByRole("option").nth(2).click();
  await expect(box).toHaveValue("/implement ");
  await expect(box).toBeFocused();

  await box.fill("/c");
  await expect(list.getByRole("option")).toHaveCount(1);
  await expect(list.getByRole("option")).toContainText("/chat");
  await box.press("Tab");
  await expect(box).toHaveValue("/chat ");
  await expect(list).toHaveCount(0);

  await box.fill("/");
  await box.press("ArrowDown");
  await box.press("Enter");
  await expect(box).toHaveValue("/chat ");
  await expect(page).toHaveURL(/\/repo\?path=/);

  await box.fill("/");
  await box.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(box).toHaveValue("/");
  await box.fill("/r");
  await expect(list.getByRole("option")).toHaveCount(1);
  await expect(list.getByRole("option")).toContainText("/review");
});

test("/chat starts a conversation session", async ({ page, request }) => {
  await openStartBox(page, request);
  const box = page.getByLabel("start");
  await box.fill("/chat Hello from the start box");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);
  const conversation = page.getByTestId("conversation");
  await expect(conversation).toContainText("Hello from the start box", { timeout: 10_000 });
  await expect(conversation).toContainText("Stub answer.", { timeout: 10_000 });
  await expect(page.locator(".session-title")).toHaveText("/chat Hello from the start box");
  await expect(page.getByTestId("analysis")).toHaveCount(0);

  await conversation.getByLabel("message").fill("And more?");
  await conversation.getByRole("button", { name: "Send" }).click();
  await expect(conversation.locator(".msg.assistant", { hasText: "Stub answer." })).toHaveCount(2, { timeout: 10_000 });
});

test("a task's name in the activity strip opens what its LLM run said and did", async ({ page, request }) => {
  await openStartBox(page, request);
  const box = page.getByLabel("start");
  await box.fill("/chat ACTIVITY-PLEASE where is the caller?");
  await box.press("Enter");
  await expect(page.getByTestId("conversation")).toContainText("Found it.", { timeout: 10_000 });
  await page.getByTestId("task-chatTurn").getByRole("button", { name: "chatTurn" }).click();
  const log = page.getByRole("dialog", { name: "chatTurn activity" });
  await expect(log.locator("li")).toHaveText(["Find the caller first.", "Grep CallerOfThings", "The caller lives in c.txt."]);
  await log.getByRole("button", { name: "Close activity" }).click();
  await expect(log).toHaveCount(0);
});

test("the model last used starts out selected in the next model picker", async ({ page, request }) => {
  await openStartBox(page, request);
  await page.getByLabel("backend").selectOption("codex");
  const box = page.getByLabel("start");
  await box.fill("/chat Remember my model");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);
  await expect(page.getByTestId("conversation")).toContainText("Remember my model", { timeout: 10_000 });
  await openStartBox(page, request);
  await expect(page.getByLabel("backend")).toHaveValue("codex");
});

test("bad commands show an inline error and create nothing", async ({ page, request }) => {
  await openStartBox(page, request);
  const box = page.getByLabel("start");
  const error = page.getByTestId("start-error");
  for (const [input, message] of [
    ["/nope x", "Unknown command /nope"],
    ["/review D5x", "Usage: /review"],
    ["/chat", "Usage: /chat"],
  ]) {
    await box.fill(input);
    await box.press("Enter");
    await expect(error).toContainText(message);
    await expect(page).toHaveURL(/\/repo\?path=/);
  }
});

test("plain text goes to the selector: chat", async ({ page, request }) => {
  await openStartBox(page, request);
  const prompt = "SELECT-ROUTE-CHAT what does this repository do?";
  const box = page.getByLabel("start");
  await box.fill(prompt);
  await box.press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);
  await expect(page.locator(".session-title")).toHaveText("Chat via selector", { timeout: 10_000 });
  const conversation = page.getByTestId("conversation");
  await expect(conversation).toContainText(prompt, { timeout: 10_000 });
  await expect(conversation).toContainText("Stub answer.", { timeout: 10_000 });
});

test("the selector asks its question in the start box and continues with the answer", async ({ page, request }) => {
  await openStartBox(page, request);
  const box = page.getByLabel("start");
  await box.fill("SELECT-ROUTE-ASK look at my branch");
  await box.press("Enter");
  const question = page.getByTestId("start-question");
  await expect(question).toContainText("Review your branch or chat about it?", { timeout: 10_000 });
  await expect(page).toHaveURL(/\/repo\?path=/);
  await question.getByLabel("answer").fill("just chat");
  await question.getByLabel("answer").press("Enter");
  await expect(page.locator(".session-title")).toHaveText("Chat via selector", { timeout: 10_000 });
  await expect(page.getByTestId("conversation")).toContainText("Answer: just chat");
  await expect(page.getByTestId("conversation")).toContainText("Stub answer.", { timeout: 10_000 });
});

test("plain text goes to the selector: review", async ({ page, request }) => {
  await openStartBox(page, request);
  const box = page.getByLabel("start");
  await box.fill("SELECT-ROUTE-REVIEW please look at my last commit");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);
  await expect(page.locator(".session-title")).toHaveText("Review via selector", { timeout: 10_000 });
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  const conversation = page.getByTestId("conversation");
  await expect(conversation).toContainText("please look at my last commit");
  await conversation.getByLabel("message").fill("Tell me about this review");
  await conversation.getByRole("button", { name: "Send" }).click();
  await expect(conversation).toContainText("Stub answer.", { timeout: 10_000 });
  await expect(page.getByTestId("change-c1")).toBeVisible();
});

test("/review with a range runs the review chain", async ({ page, request }) => {
  await openStartBox(page, request);
  const box = page.getByLabel("start");
  await box.fill("/review HEAD~1..HEAD");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Epoch 1")).toBeVisible();
  await expect(page.getByTestId("review-range")).toContainText("Reviewing 1 commit:");
  await expect(page.getByTestId("review-range")).toHaveAttribute("title", /^[0-9a-f]+\.\.[0-9a-f]+$/);
});

test("/review D<id> imports the revision named by .arcconfig and leaves the repo untouched", async ({ page, request }) => {
  const ids = newRevision();
  const dir = mkdtempSync(join(tmpdir(), "spatial-start-review-"));
  repoDirs.push(dir);
  git(dir, "init", "-b", "main");
  writeFileSync(join(dir, "a.txt"), `${Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n")}\n`);
  writeFileSync(join(dir, ".arcconfig"), JSON.stringify({ "phabricator.uri": "https://phab.example.com/" }));
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "base");
  const base = git(dir, "rev-parse", "HEAD");

  const scratch = mkdtempSync(join(tmpdir(), "spatial-start-review-scratch-"));
  repoDirs.push(scratch);
  execFileSync("git", ["clone", "-q", dir, scratch]);
  const lines = readFileSync(join(scratch, "a.txt"), "utf8").trimEnd().split("\n");
  lines[29] = "THIRTY";
  writeFileSync(join(scratch, "a.txt"), `${lines.join("\n")}\n`);
  writeFileSync(join(scratch, "c.txt"), "c\n");
  execFileSync("git", ["-C", scratch, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "add", "-A"]);
  execFileSync("git", ["-C", scratch, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "commit", "-m", "Bug 1 - Remote change"]);
  const raw = execFileSync("git", ["-C", scratch, "diff", base, "HEAD"], { encoding: "utf8" });
  const control = await request.post("http://127.0.0.1:4179/control", { data: { revision: ids.revision, title: "Bug 1 - Remote change", base, diffs: [ids.diff], rawDiffs: { [ids.diff]: raw } } });
  expect(control.ok()).toBeTruthy();

  const snapshot = () => ({
    head: git(dir, "rev-parse", "HEAD"), branch: git(dir, "symbolic-ref", "HEAD"), status: git(dir, "status", "--porcelain"),
    branches: git(dir, "branch", "--list"), heads: git(dir, "for-each-ref", "refs/heads", "refs/tags", "refs/remotes"),
    index: readFileSync(join(dir, ".git", "index")), files: readdirSync(dir).sort(),
  });
  const before = snapshot();

  await page.goto(`http://127.0.0.1:4178/repo?path=${encodeURIComponent(dir)}`);
  const box = page.getByLabel("start");
  await box.fill(`/review D${ids.revision}`);
  await box.press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("summary")).toContainText("Edits a and adds c.");

  expect(snapshot()).toEqual(before);
  const spatialRef = git(dir, "for-each-ref", "--format=%(refname)", "refs/spatial").split("\n").find((ref) => ref.startsWith(`refs/spatial/D${ids.revision}/${ids.diff}-`));
  expect(spatialRef).toBeTruthy();
  expect(git(dir, "log", "-1", "--format=%B", spatialRef!)).toContain(`Differential Revision: https://phab.example.com/D${ids.revision}`);
});

test("Retry repeats a failed revision import", async ({ page, request }) => {
  const ids = newRevision();
  const dir = mkdtempSync(join(tmpdir(), "spatial-start-retry-"));
  repoDirs.push(dir);
  git(dir, "init", "-b", "main");
  writeFileSync(join(dir, "a.txt"), `${Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n")}\n`);
  writeFileSync(join(dir, ".arcconfig"), JSON.stringify({ "phabricator.uri": "https://phab.example.com/" }));
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "base");
  const base = git(dir, "rev-parse", "HEAD");
  const scratch = mkdtempSync(join(tmpdir(), "spatial-start-retry-scratch-"));
  repoDirs.push(scratch);
  execFileSync("git", ["clone", "-q", dir, scratch]);
  const lines = readFileSync(join(scratch, "a.txt"), "utf8").trimEnd().split("\n");
  lines[29] = "THIRTY";
  writeFileSync(join(scratch, "a.txt"), `${lines.join("\n")}\n`);
  writeFileSync(join(scratch, "c.txt"), "c\n");
  execFileSync("git", ["-C", scratch, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "add", "-A"]);
  execFileSync("git", ["-C", scratch, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "commit", "-m", "Remote change"]);
  const raw = execFileSync("git", ["-C", scratch, "diff", base, "HEAD"], { encoding: "utf8" });
  const missing = "e".repeat(40);
  const register = (revisionBase: string) => request.post("http://127.0.0.1:4179/control", { data: { revision: ids.revision, title: "Remote change", base: revisionBase, diffs: [ids.diff], rawDiffs: { [ids.diff]: raw } } });
  expect((await register(missing)).ok()).toBeTruthy();
  await page.goto(`http://127.0.0.1:4178/repo?path=${encodeURIComponent(dir)}`);
  const box = page.getByLabel("start");
  await box.fill(`/review D${ids.revision}`);
  await box.press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);
  await expect(page.getByTestId("analysis")).toHaveAttribute("data-state", "failed");
  await expect(page.getByTestId("task-importRevision")).toHaveAttribute("data-status", "failed");
  await expect(page.getByTestId("analysis")).toContainText(new RegExp(`Base commit ${missing} of D${ids.revision}`));
  expect(git(dir, "status", "--porcelain")).toBe("");
  expect(git(dir, "for-each-ref", "--format=%(refname)", "refs/spatial")).toBe("");

  expect((await register(base)).ok()).toBeTruthy();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    const sessionId = decodeURIComponent(new URL(page.url()).pathname.split("/")[2]!);
    const state = await (await request.get(`http://127.0.0.1:4178/api/sessions/${sessionId}/state`)).json() as { tasks: { kind: string }[] };
    expect(state.tasks.filter((task) => task.kind === "importRevision")).toHaveLength(2);
  }).toPass();
  expect(git(dir, "status", "--porcelain")).toBe("");
  expect(git(dir, "for-each-ref", "--format=%(refname)", "refs/spatial").split("\n").every((ref) => ref.startsWith(`refs/spatial/D${ids.revision}/`))).toBeTruthy();
});
