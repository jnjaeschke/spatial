import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { revealNode } from "./canvas.ts";

const repoDirs: string[] = [];
test.afterEach(() => { for (const dir of repoDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const treeherder = (action: "hold" | "release") => fetch(`http://127.0.0.1:4181/${action}`, { method: "POST" });
test.afterEach(async () => { await treeherder("release"); });

function git(dir: string, ...args: string[]) {
  return execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();
}
function makeRepo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "spatial-implement-")));
  repoDirs.push(dir);
  git(dir, "init", "-b", "main");
  writeFileSync(join(dir, "a.txt"), `${Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n")}\n`);
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "base");
  return dir;
}
const open = (path: string) => `http://127.0.0.1:4178/repo?path=${encodeURIComponent(path)}`;

function makeGeckoRepo() {
  const dir = makeRepo();
  writeFileSync(join(dir, "mach"), `#!/bin/sh\nif [ "$1" = file-info ]; then echo '{"files":["c.txt"],"herald_groups":[{"name":"dom-core","blocking":false}],"herald_individuals":[]}'; exit 0; fi\nprintf '%s\\n' "$@" > .git/mach-args\necho "try submission success in 1.0s:"\necho " https://treeherder.mozilla.org/jobs?repo=try&landoInstance=lando-prod-2025&landoCommitID=42"\n`);
  chmodSync(join(dir, "mach"), 0o755);
  writeFileSync(join(dir, "moz.build"), "");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "gecko markers");
  return dir;
}

function inlineTx(id: number, path: string, line: number, body: string) {
  return { id, phid: `PHID-XACT-${id}`, type: "inline", authorPHID: "PHID-USER-alice", objectPHID: "PHID-DREV-4242", dateCreated: id, dateModified: id, groupID: null, comments: [{ id: id + 100, phid: `PHID-XCMT-${id}`, version: 1, authorPHID: "PHID-USER-alice", dateCreated: id - 1, dateModified: id, removed: false, content: { raw: body } }], fields: { diff: { id: 42421, phid: "PHID-DIFF-42421" }, path, line, length: 1, isNewFile: true, replyToCommentPHID: null, isDone: false, hasSuggestion: false, suggestionText: null } };
}

test("implement: investigate, approve, implement, automatic fix round, revise, accept", async ({ page }) => {
  test.setTimeout(120_000);
  const dir = makeRepo();
  await page.goto(open(dir));
  await page.getByLabel("start").fill("/implement IMPL-E2E make c.txt exist");
  await page.getByLabel("start").press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);

  const investigation = page.getByTestId("investigation");
  await expect(investigation).toContainText("The c file is missing.", { timeout: 20_000 });
  await expect(investigation).toContainText("1 location dropped");
  await expect(investigation).toContainText("Should d exist too?");
  await expect(investigation).toContainText("grep for c");
  await expect(investigation.getByTestId("acceptance-check")).toHaveCount(1);
  await expect(investigation.getByTestId("acceptance-check")).toContainText("new-test");
  await expect(investigation.getByTestId("acceptance-check")).toContainText("c.test.txt");
  await expect(investigation).toContainText("1 check dropped");
  await expect(page.getByTestId("investigation-location")).toHaveCount(1);
  await expect(page.getByTestId("decision-node")).toContainText("Approve the investigation plan?");

  const bar = page.getByTestId("topbar-decision");
  await bar.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByTestId("epoch-chip-1")).toContainText("Approve (you)");
  await expect(page.getByTestId("epoch-chip-3")).toContainText("Fix (rule)", { timeout: 60_000 });

  await page.getByTestId("epoch-chip-2").click();
  await page.getByTestId("command-chip").filter({ hasText: "echo hello-from-agent" }).click();
  await expect(page.getByTestId("terminal-output")).toContainText("hello-from-agent");
  await page.getByTestId("epoch-chip-5").click();

  await expect(bar).toContainText("The self-review is done", { timeout: 60_000 });
  await expect(bar.getByRole("button", { name: "Accept" })).toBeVisible();
  await bar.getByLabel("decision text").fill("REVISE-IMPL tweak line 31");
  await bar.getByRole("button", { name: "Revise" }).click();
  await expect(page.getByTestId("epoch-chip-7")).toContainText("review", { timeout: 60_000 });
  await expect(page.getByTestId("epoch-chip-5")).toContainText("Revise (you)");
  await expect(bar.getByRole("button", { name: "Accept" })).toBeVisible({ timeout: 60_000 });
  await bar.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByTestId("epoch-chip-7")).toContainText("Accept (you)");
  await expect(bar).toHaveCount(0);

  const branch = "spatial/impl-e2e-make-c-txt-exist";
  expect(git(dir, "branch", "--show-current")).toBe(branch);
  expect(git(dir, "log", "--format=%s", `main..${branch}`)).toBe("Fix the c thing");
  expect(readFileSync(join(dir, "a.txt"), "utf8")).toContain("THIRTY-ONE");
  expect(git(dir, "status", "--porcelain")).toBe("");
});

test("steering a running implement epoch restarts it, resumed with the steer, and remembers the steer", async ({ page }) => {
  test.setTimeout(120_000);
  const dir = makeRepo();
  await page.goto(open(dir));
  await page.getByLabel("start").fill("/implement IMPL-STEER make c.txt exist");
  await page.getByLabel("start").press("Enter");
  const bar = page.getByTestId("topbar-decision");
  await expect(bar).toContainText("Approve the investigation plan?", { timeout: 20_000 });
  await bar.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByTestId("implement-running")).toBeVisible({ timeout: 20_000 });
  const sessionId = /\/sessions\/([^/?#]+)/.exec(page.url())![1];
  await expect.poll(async () => ((await (await page.request.get(`http://127.0.0.1:4178/api/sessions/${sessionId}/state`)).json()) as { artifacts: { type: string }[] }).artifacts.some((a) => a.type === "AgentSession"), { timeout: 20_000 }).toBe(true);
  const conversation = page.getByTestId("conversation");
  await conversation.getByLabel("message").fill("Keep the diff small");
  const liveSteer = conversation.getByRole("button", { name: "Steer", exact: true });
  await revealNode(page, liveSteer);
  await liveSteer.click();
  await expect(conversation.getByTestId("steer-item").first()).toHaveText(/^Steered Keep the diff small/);
  await expect(page.getByTestId("implement-running")).toBeVisible();
  await conversation.getByLabel("message").fill("STEER-ME name the helper");
  const steer = conversation.getByRole("button", { name: "Stop & steer" });
  await revealNode(page, steer);
  await steer.click();
  await expect(bar).toContainText("The self-review is done", { timeout: 60_000 });
  await page.getByTestId("epoch-chip-2").click();
  await expect(page.getByTestId("steer-outcome")).toContainText(/resumed with your steer/i);
  const [canvasWidth, bodyWidth] = await Promise.all([page.locator(".phase-shell > .canvas").boundingBox(), page.locator(".phase-shell").boundingBox()]).then((boxes) => boxes.map((box) => box!.width));
  expect(canvasWidth).toBeGreaterThan(bodyWidth! * 0.9);
  expect(git(dir, "log", "--format=%s", "main..spatial/impl-steer-make-c-txt-exist")).toBe("Fix the c thing");
  await page.getByTestId("epoch-chip-3").click();
  await expect(page.getByTestId("toasts")).toContainText("Remembered: Name helpers after what they return");
  await expect(conversation.getByTestId("steer-item").last()).toHaveText(/^Stopped and steered STEER-ME name the helper/);
  const notice = conversation.getByTestId("memory-notice");
  await expect(notice).toContainText("Remembered for this repo");
  await expect(notice).toContainText("Name helpers after what they return");
  await revealNode(page, notice);
  await notice.getByRole("button", { name: "Forget this" }).click();
  await expect(notice).toContainText("Forgotten");
  await expect(notice.getByRole("button", { name: "Forget this" })).toHaveCount(0);
  await notice.getByRole("button", { name: "Edit instead" }).click();
  await expect(page).toHaveURL(/\/repo\?path=.*&memory=repo%2Fname-helpers/);
});

test("the repo page lists memories and edits, moves and deletes them", async ({ page, request }) => {
  const dir = makeRepo();
  const { repoDir } = await (await request.get(`http://127.0.0.1:4178/api/repo?path=${encodeURIComponent(dir)}`)).json();
  const memory = { situation: "a test fails for an unrelated reason", observed: "The agent kept retrying", wanted: "Stop and report the unrelated failure", why: null, phases: ["implement"], kinds: [], source: { sessionId: "s1", epoch: 1, steer: "st1" } };
  const put = await request.put("http://127.0.0.1:4178/api/memories", { data: { repo: repoDir, scope: "repo", key: "report-unrelated-failures", memory } });
  expect(put.status()).toBe(201);
  await page.goto(`${open(dir)}&memory=repo%2Freport-unrelated-failures`);
  const item = page.getByTestId("memory-item");
  await expect(item.getByLabel("wanted")).toHaveValue("Stop and report the unrelated failure");
  await item.getByLabel("wanted").fill("Report the failure and continue");
  await item.getByRole("button", { name: "Save" }).click();
  await expect(item).toContainText("Report the failure and continue");
  await expect(item).toContainText("this repo");
  await item.getByRole("button", { name: "Move to everywhere" }).click();
  await expect(item).toContainText("everywhere");
  await item.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("memory-item")).toHaveCount(0);
  await expect(page.getByTestId("memories-panel")).toContainText("None yet");
});

test("a dirty checkout asks in the start box when the selector chooses implement", async ({ page }) => {
  const dir = makeRepo();
  writeFileSync(join(dir, "a.txt"), "dirty\n");
  await page.goto(open(dir));
  const box = page.getByLabel("start");
  await box.fill("SELECT-ROUTE-IMPLEMENT fix it");
  await box.press("Enter");
  const question = page.getByTestId("start-question");
  await expect(question).toContainText("uncommitted changes in 1 file", { timeout: 10_000 });
  await expect(question.getByRole("button", { name: /Continue on main with the uncommitted changes/ })).toBeVisible();
  await expect(question.getByLabel("answer")).toHaveCount(0);
  await expect(page).not.toHaveURL(/\/sessions\/[^/]+/);
  await question.getByRole("button", { name: "Cancel" }).click();
  await expect(question).toHaveCount(0);
});

test("a dirty checkout asks before /implement starts and the changes move to the new branch", async ({ page }) => {
  const dir = makeRepo();
  writeFileSync(join(dir, "a.txt"), "dirty\n");
  await page.goto(open(dir));
  const box = page.getByLabel("start");
  await box.fill("/implement IMPL-E2E-ASK do it");
  await box.press("Enter");
  const question = page.getByTestId("start-question");
  await expect(question).toContainText("uncommitted changes in 1 file");
  await expect(page).not.toHaveURL(/\/sessions\/[^/]+/);
  await question.getByRole("button", { name: "Cancel" }).click();
  await expect(question).toHaveCount(0);
  await box.press("Enter");
  await question.getByRole("button", { name: /New branch/ }).click();
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);
  await expect(page.getByTestId("investigation")).toBeVisible({ timeout: 20_000 });
  expect(git(dir, "branch", "--show-current")).toBe("spatial/impl-e2e-ask-do-it");
  expect(git(dir, "status", "--porcelain")).toContain("a.txt");
});

test("the write mode is remembered per repository", async ({ page }) => {
  const dir = makeRepo();
  await page.goto(open(dir));
  const mode = page.getByLabel("write mode");
  await expect(mode).toHaveValue("auto");
  await mode.selectOption("editsOnly");
  await page.reload();
  await expect(page.getByLabel("write mode")).toHaveValue("editsOnly");
});

test("gecko: after Accept try and Phabricator submit run only on click", async ({ page }) => {
  test.setTimeout(120_000);
  const dir = makeGeckoRepo();
  await page.goto(open(dir));
  await page.getByLabel("start").fill("/implement TRY-E2E Bug 4242 make c.txt exist");
  await page.getByLabel("start").press("Enter");
  const bar = page.getByTestId("topbar-decision");
  await expect(bar).toContainText("Approve the investigation plan?", { timeout: 20_000 });
  await bar.getByRole("button", { name: "Approve" }).click();
  await expect(bar).toContainText("The self-review is done", { timeout: 60_000 });
  await page.getByTestId("epoch-chip-2").click();
  const checkResult = page.getByTestId("check-result");
  await expect(checkResult).toHaveCount(1);
  await expect(checkResult).toContainText("covering-test a.txt");
  await expect(checkResult).toHaveAttribute("data-ok", "true");
  await checkResult.getByTestId("check-run").click();
  await expect(page.getByTestId("terminal-output")).toContainText("tests-ran-ok");
  await page.getByTestId("epoch-chip-3").click();
  await bar.getByRole("button", { name: "Accept" }).click();
  await expect(bar).toContainText(/Push [0-9a-f]{12} to try\?/, { timeout: 20_000 });
  await expect(page.getByTestId("try-proposal")).toContainText("Runs the plain mochitests.");
  await expect(bar.getByLabel("decision text")).toHaveValue("./mach try fuzzy --query 'mochitest-plain'");
  expect(existsSync(join(dir, ".git/mach-args"))).toBe(false);
  await bar.getByLabel("decision text").fill("./mach try fuzzy --query 'mochitest-plain' --artifact");
  await treeherder("hold");
  await bar.getByRole("button", { name: "Push" }).click();
  await expect(bar).toContainText(/Submit 1 commit \([0-9a-f]{12}\) to Phabricator\?/, { timeout: 20_000 });
  await expect(bar.getByLabel("decision text")).toHaveValue("#dom-core");
  await expect(page.getByTestId("reviewer-suggestion")).toContainText("#dom-core");
  expect(existsSync(join(dir, ".git/moz-phab-args"))).toBe(false);

  await page.getByTestId("epoch-chip-5").click();
  const refresh = page.getByRole("button", { name: "Check Treeherder now" });
  await expect(page.getByTestId("try-headline")).toContainText("Running: 1 done, 1 running, 1 pending", { timeout: 20_000 });
  await expect(refresh).toBeVisible();
  const refreshed = page.waitForResponse((res) => /\/try\/pushes\/[^/]+\/refresh$/.test(res.url()));
  await refresh.click();
  expect((await refreshed).status()).toBe(200);
  await treeherder("release");
  await expect(page.getByTestId("try-failure")).toContainText("test-linux1804-64/opt-mochitest-plain-1", { timeout: 20_000 });
  await expect(page.getByTestId("try-failure")).toContainText("c is missing");
  await expect(page.getByTestId("try-headline")).toContainText("Finished: 3 done, 1 failing", { timeout: 20_000 });
  await expect(refresh).toHaveCount(0);
  expect(readFileSync(join(dir, ".git/mach-args"), "utf8").split("\n").filter(Boolean)).toEqual(["try", "fuzzy", "--query", "mochitest-plain", "--artifact"]);

  const base = git(dir, "rev-parse", "main");
  await bar.getByLabel("decision text").fill("#dom-core, smaug");
  await bar.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByTestId("epoch-chip-7")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("epoch-chip-7").click();
  await expect(page.getByTestId("phab-revision")).toContainText("D4242", { timeout: 20_000 });
  expect(readFileSync(join(dir, ".git/moz-phab-args"), "utf8").split("\n").filter(Boolean)).toEqual(["submit", "--yes", "--reviewer", "#dom-core,smaug", base, "HEAD"]);
  expect(git(dir, "log", "-1", "--format=%B")).toContain("Differential Revision: https://phab.example.com/D4242");
  expect(git(dir, "log", "--format=%s", "-1")).toBe("Bug 4242 - Add c");
});

test("gecko: reviewer comments are interpreted, marked, replied to as drafts and worked in", async ({ page, request }) => {
  test.setTimeout(180_000);
  const dir = makeGeckoRepo();
  await page.goto(open(dir));
  await page.getByLabel("start").fill("/implement TRY-E2E Bug 4242 make c.txt exist");
  await page.getByLabel("start").press("Enter");
  const bar = page.getByTestId("topbar-decision");
  await expect(bar).toContainText("Approve the investigation plan?", { timeout: 20_000 });
  await bar.getByRole("button", { name: "Approve" }).click();
  await expect(bar).toContainText("The self-review is done", { timeout: 60_000 });
  await bar.getByRole("button", { name: "Accept" }).click();
  await expect(bar).toContainText(/Push [0-9a-f]{12} to try\?/, { timeout: 20_000 });
  await bar.getByRole("button", { name: "Skip" }).click();
  await expect(bar).toContainText(/Submit 1 commit \([0-9a-f]{12}\) to Phabricator\?/, { timeout: 20_000 });
  await bar.getByLabel("decision text").fill("#dom-core");
  await bar.getByRole("button", { name: "Submit", exact: true }).click();

  await page.getByTestId("epoch-chip-6").waitFor({ timeout: 20_000 });
  await request.post("http://127.0.0.1:4179/control", { data: { revision: 4242, transactions: [inlineTx(4301, "c.txt", 1, "Magic value?"), inlineTx(4302, "c.txt", 1, "Why a new file?")] } });
  await expect(bar).toContainText("Work in 2 reviewer comments?", { timeout: 30_000 });
  const comments = page.getByTestId("reviewer-comment");
  await expect(comments).toHaveCount(2);
  expect((await page.getByTestId("epoch-strip").boundingBox())!.height).toBeLessThan(100);
  await expect(comments.nth(1)).toBeInViewport();
  await expect(comments.nth(0)).toHaveAttribute("data-action", "address");
  await expect(comments.nth(0).getByTestId("comment-asks")).toContainText("Name the magic value");
  await expect(comments.nth(1)).toHaveAttribute("data-action", "reply");
  await expect(comments.nth(1).getByLabel("comment text")).toHaveValue("A new file keeps the change small.");
  await comments.nth(1).getByLabel("comment text").fill("Smaller diff this way.");
  await comments.nth(1).getByRole("button", { name: "Save" }).click();
  await page.getByTestId("post-replies").click();
  await expect(page.getByTestId("post-replies-result")).toContainText("Posted 1 draft reply");
  const inlines = await (await request.get("http://127.0.0.1:4179/control/inlines?revision=4242")).json();
  expect(inlines.map((i: { content: string; filePath: string }) => [i.filePath, i.content])).toEqual([["c.txt", "Smaller diff this way."]]);
  await bar.getByRole("button", { name: "Work in" }).click();
  await expect(bar).toContainText("The self-review is done", { timeout: 60_000 });
  expect(readFileSync(join(dir, "c.txt"), "utf8")).toContain("kept");
  expect(git(dir, "log", "-1", "--format=%B")).toContain("Differential Revision: https://phab.example.com/D4242");
});

test("gecko: chat proposes a try push and nothing is pushed until the click", async ({ page }) => {
  const dir = makeGeckoRepo();
  writeFileSync(join(dir, "c.txt"), "c\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "Bug 1 - Add c");
  await page.goto(open(dir));
  await page.getByLabel("start").fill("/review");
  await page.getByLabel("start").press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);
  const conversation = page.getByTestId("conversation");
  const input = conversation.getByLabel("message");
  await input.fill("PUSH-TRY-PLEASE");
  await conversation.getByRole("button", { name: "Send" }).click();
  const bar = page.getByTestId("topbar-decision");
  await expect(bar).toContainText(/Push [0-9a-f]{12} to try\?/, { timeout: 20_000 });
  await expect(bar.getByLabel("decision text")).toHaveValue("./mach try auto");
  await expect(page.getByTestId("try-proposal")).toContainText("You asked for try.");
  expect(existsSync(join(dir, ".git/mach-args"))).toBe(false);
  await bar.getByRole("button", { name: "Skip" }).click();
  await expect(bar).toHaveCount(0);
  expect(existsSync(join(dir, ".git/mach-args"))).toBe(false);
  await page.getByTestId("epoch-chip-1").click();
  await expect(conversation.locator(".msg.assistant")).toContainText("I will start a try push.");
});

test("memories for the investigate phase are applied and listed in its view", async ({ page, request }) => {
  const dir = makeRepo();
  const { repoDir } = await (await request.get(`http://127.0.0.1:4178/api/repo?path=${encodeURIComponent(dir)}`)).json();
  const memory = { situation: "the plan touches code with tests", observed: "The agent skipped the tests", wanted: "Read the tests before planning", why: null, phases: ["investigate"], kinds: [], source: { sessionId: "s1", epoch: 1, steer: "st1" } };
  expect((await request.put("http://127.0.0.1:4178/api/memories", { data: { repo: repoDir, scope: "repo", key: "read-tests-first", memory } })).status()).toBe(201);
  await page.goto(open(dir));
  await page.getByLabel("start").fill("/implement IMPL-MEM make c.txt exist");
  await page.getByLabel("start").press("Enter");
  await expect(page.getByTestId("investigation")).toContainText("The c file is missing.", { timeout: 20_000 });
  await expect(page.getByTestId("used-memories")).toContainText("repo/read-tests-first");
});
