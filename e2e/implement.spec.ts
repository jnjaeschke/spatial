import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, inlineTx, makeRepo as createRepo } from "./repo.ts";
import { test, expect } from "@playwright/test";

const repoDirs: string[] = [];
test.afterEach(() => { for (const dir of repoDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const treeherder = (action: "hold" | "release") => fetch(`http://127.0.0.1:4181/${action}`, { method: "POST" });
test.afterEach(async () => { await treeherder("release"); });

function makeRepo() {
  const dir = createRepo("spatial-implement-", { "a.txt": `${Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n")}\n` });
  repoDirs.push(dir);
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
  await expect(page.getByTestId("investigation-questions")).toContainText("Should d exist too?");
  await expect(investigation).toContainText("grep for c");
  const step = page.getByTestId("investigation-step-0");
  await expect(step).toContainText("Add c");
  await expect(step.getByTestId("acceptance-check")).toHaveCount(1);
  await expect(step.getByTestId("acceptance-check")).toContainText("new-test");
  await expect(step.getByTestId("acceptance-check")).toContainText("c.test.txt");
  await expect(investigation).toContainText("1 check dropped");
  await expect(page.getByTestId("investigation-location")).toHaveCount(1);
  await expect(page.getByTestId("investigation-tests")).toContainText("Test cases (1)");
  await expect(page.getByTestId("investigation-tests").getByText("c exists")).toHaveCount(0);
  await step.locator("p").first().dblclick();
  await page.locator(".ask-selection").getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".react-flow__node-chat").getByLabel("message")).toBeVisible();
  await expect(page.getByTestId("session-decision")).toContainText("Approve the investigation plan?");
  await expect(page.getByTestId("session-popover").locator(".messages .msg.decision")).toHaveCount(1);

  const bar = page.getByTestId("session-decision");
  await bar.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByTestId("epoch-chip-1")).toContainText("Approve (you)");
  await expect(page.getByTestId("epoch-chip-3")).toContainText("Fix (rule)", { timeout: 60_000 });
  await expect(bar).toContainText("The self-review is done", { timeout: 60_000 });

  await page.getByTestId("epoch-chip-1").click();
  await expect(investigation).toBeVisible();
  await expect(page.locator(".react-flow__node-chat")).toHaveCount(1);
  await expect(page.locator(".react-flow__node-chat").getByLabel("message")).toHaveCount(0);
  await page.getByTestId("epoch-chip-2").click();
  await page.getByTestId("command-summary").click();
  const log = page.getByRole("dialog", { name: "implement activity" });
  await expect(log.getByTestId("tool-output")).toHaveCount(0);
  await log.getByRole("button", { name: /echo hello-from-agent/ }).click();
  await expect(log.getByTestId("tool-output")).toContainText("hello-from-agent");
  await log.getByRole("button", { name: "Close activity" }).click();
  await page.getByTestId("epoch-chip-5").click();
  await page.getByTestId("session-chip").click();
  await expect(bar.getByRole("button", { name: "Accept" })).toBeVisible();
  await page.getByTestId("session-popover").getByLabel("message").fill("REVISE-IMPL tweak line 31");
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

test("implement: a plan step is its own node and a selection inside it asks a chat anchored on that step", async ({ page, request }) => {
  test.setTimeout(60_000);
  const dir = makeRepo();
  await page.goto(open(dir));
  await page.getByLabel("start").fill("/implement IMPL-E2E make c.txt exist");
  await page.getByLabel("start").press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);
  const sessionId = decodeURIComponent(new URL(page.url()).pathname.split("/")[2]!);
  const step = page.getByTestId("investigation-step-0");
  await expect(step).toContainText("Add c.txt and set line 30.", { timeout: 20_000 });
  await expect(page.getByTestId("investigation")).not.toContainText("Add c.txt and set line 30.");
  const text = (await step.locator("p").first().boundingBox())!;
  await page.mouse.move(text.x + 2, text.y + text.height / 2);
  await page.mouse.down();
  await page.mouse.move(text.x + text.width - 2, text.y + text.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.locator(".ask-selection").getByRole("button", { name: "Ask", exact: true }).click();
  const chat = page.locator(".react-flow__node-chat");
  await chat.getByLabel("message").fill("Why this step?");
  await chat.getByRole("button", { name: "Send" }).click();
  await expect.poll(async () => {
    const state = await (await request.get(`http://127.0.0.1:4178/api/sessions/${sessionId}/state`)).json() as { artifacts: { id: string; type: string; data: { anchor?: string } }[] };
    const investigation = state.artifacts.find((artifact) => artifact.type === "Investigation");
    return state.artifacts.find((artifact) => artifact.type === "ChatThread" && artifact.data.anchor === `${investigation?.id}#step0`) !== undefined;
  }, { timeout: 20_000 }).toBe(true);
});

test("session chip: a decision opens the popover once, closing leaves it pending, answering clears it, a task log replaces it", async ({ page }) => {
  test.setTimeout(120_000);
  const dir = makeRepo();
  await page.goto(open(dir));
  await page.getByLabel("start").fill("/implement IMPL-E2E make c.txt exist");
  await page.getByLabel("start").press("Enter");
  const popover = page.getByRole("dialog", { name: "Session" });
  const chip = page.getByTestId("session-chip");
  await expect(popover.getByTestId("session-decision")).toContainText("Approve the investigation plan?", { timeout: 20_000 });
  await expect(page.getByTestId("investigation")).toBeVisible();
  await expect(chip).toHaveAttribute("data-state", "idle");

  await popover.getByRole("button", { name: "Close session" }).click();
  await expect(popover).toHaveCount(0);
  await expect(chip).toHaveAttribute("data-state", "pending");
  await page.reload();
  await expect(chip).toHaveAttribute("data-state", "pending");
  await expect(popover).toHaveCount(0);

  await chip.click();
  await popover.getByRole("button", { name: "Approve" }).click();
  await expect(popover).not.toContainText("Approve the investigation plan?");
  await expect(popover.getByTestId("session-decision")).toContainText("The self-review is done", { timeout: 60_000 });

  await page.locator(".activity .task-name").first().click();
  await expect(popover).toHaveCount(0);
  const log = page.getByRole("dialog", { name: / activity$/ });
  await expect(log).toBeVisible();
  await chip.click();
  await expect(popover).toBeVisible();
  await expect(log).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("session chip: a selection in the main chat does not offer to ask", async ({ page }) => {
  test.setTimeout(60_000);
  const dir = makeRepo();
  await page.goto(open(dir));
  await page.getByLabel("start").fill("/implement IMPL-E2E make c.txt exist");
  await page.getByLabel("start").press("Enter");
  const popover = page.getByRole("dialog", { name: "Session" });
  await expect(popover.getByTestId("session-decision")).toBeVisible({ timeout: 20_000 });
  await popover.getByLabel("message").fill("Why this plan?");
  await popover.getByRole("button", { name: "Send" }).click();
  const answer = popover.locator(".msg.assistant").first();
  await expect(answer).toContainText("Stub answer.", { timeout: 20_000 });
  await answer.evaluate((element) => window.getSelection()!.selectAllChildren(element));
  expect(await page.evaluate(() => window.getSelection()?.toString())).toContain("Stub answer.");
  await page.waitForTimeout(300);
  await expect(page.locator(".ask-selection")).toHaveCount(0);
});

test("steering a running implement epoch restarts it, resumed with the steer, and remembers the steer", async ({ page }) => {
  test.setTimeout(120_000);
  const dir = makeRepo();
  await page.goto(open(dir));
  await page.getByLabel("start").fill("/implement IMPL-STEER make c.txt exist");
  await page.getByLabel("start").press("Enter");
  const bar = page.getByTestId("session-decision");
  await expect(bar).toContainText("Approve the investigation plan?", { timeout: 20_000 });
  await bar.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByTestId("implement-running")).toBeVisible({ timeout: 20_000 });
  const sessionId = /\/sessions\/([^/?#]+)/.exec(page.url())![1];
  await expect.poll(async () => ((await (await page.request.get(`http://127.0.0.1:4178/api/sessions/${sessionId}/state`)).json()) as { artifacts: { type: string }[] }).artifacts.some((a) => a.type === "AgentSession"), { timeout: 20_000 }).toBe(true);
  const conversation = page.getByRole("dialog", { name: "Session" });
  await conversation.getByLabel("message").fill("Keep the diff small");
  await conversation.getByRole("button", { name: "Steer", exact: true }).click();
  await expect(conversation.getByTestId("steer-item").first()).toHaveText(/^Steered Keep the diff small/);
  await expect(page.getByTestId("implement-running")).toBeVisible();
  const remembering = conversation.getByTestId("steer-remembering");
  await expect(remembering).toContainText("Remembering…");
  await expect(remembering.getByRole("button", { name: "Log" })).toBeVisible();
  await expect(page.getByTestId("task-distillSteer")).toHaveCount(0);
  await remembering.getByRole("button", { name: "Cancel" }).click();
  await expect(conversation.getByTestId("steer-remember-cancelled")).toHaveText("Cancelled");
  await expect(remembering).toHaveCount(0);
  await conversation.getByLabel("message").fill("STEER-ME name the helper");
  await conversation.getByRole("button", { name: "Stop & steer" }).click();
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
  const bar = page.getByTestId("session-decision");
  await expect(bar).toContainText("Approve the investigation plan?", { timeout: 20_000 });
  await bar.getByRole("button", { name: "Approve" }).click();
  await expect(bar).toContainText("The self-review is done", { timeout: 60_000 });
  await page.getByTestId("epoch-chip-2").click();
  const checkResult = page.getByTestId("check-result");
  await expect(checkResult).toHaveCount(1);
  await expect(checkResult).toContainText("covering-test a.txt");
  await expect(checkResult).toHaveAttribute("data-ok", "true");
  await expect(page.getByTestId("command-summary")).toHaveText("1 command, 0 failed");
  await checkResult.getByTestId("check-run").click();
  await expect(page.getByRole("dialog", { name: "implement activity" }).getByTestId("tool-output")).toContainText("tests-ran-ok");
  await page.getByTestId("epoch-chip-3").click();
  await expect(page.getByTestId("summary").locator(".files").getByRole("link", { name: "Bug 4242" })).toHaveAttribute("href", "https://bugzilla.mozilla.org/show_bug.cgi?id=4242");
  await page.getByTestId("session-chip").click();
  await bar.getByRole("button", { name: "Accept" }).click();
  await expect(bar).toContainText(/Push [0-9a-f]{12} to try\?/, { timeout: 20_000 });
  await expect(page.getByTestId("try-proposal")).toContainText("Runs the plain mochitests.");
  await expect(page.getByTestId("session-popover").getByLabel("message")).toHaveValue("./mach try fuzzy --query 'mochitest-plain'");
  expect(existsSync(join(dir, ".git/mach-args"))).toBe(false);
  await page.getByTestId("session-popover").getByLabel("message").fill("./mach try fuzzy --query 'mochitest-plain' --artifact");
  await treeherder("hold");
  await bar.getByRole("button", { name: "Push" }).click();
  await expect(bar).toContainText(/Submit 1 commit \([0-9a-f]{12}\) to Phabricator\?/, { timeout: 20_000 });
  await expect(page.getByTestId("session-popover").getByLabel("message")).toHaveValue("#dom-core");
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
  await page.getByTestId("session-popover").getByLabel("message").fill("#dom-core, smaug");
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
  const bar = page.getByTestId("session-decision");
  await expect(bar).toContainText("Approve the investigation plan?", { timeout: 20_000 });
  await bar.getByRole("button", { name: "Approve" }).click();
  await expect(bar).toContainText("The self-review is done", { timeout: 60_000 });
  await bar.getByRole("button", { name: "Accept" }).click();
  await expect(bar).toContainText(/Push [0-9a-f]{12} to try\?/, { timeout: 20_000 });
  await bar.getByRole("button", { name: "Skip" }).click();
  await expect(bar).toContainText(/Submit 1 commit \([0-9a-f]{12}\) to Phabricator\?/, { timeout: 20_000 });
  await page.getByTestId("session-popover").getByLabel("message").fill("#dom-core");
  await bar.getByRole("button", { name: "Submit", exact: true }).click();

  await page.getByTestId("epoch-chip-6").waitFor({ timeout: 20_000 });
  await request.post("http://127.0.0.1:4179/control", { data: { revision: 4242, transactions: [inlineTx(4301, "c.txt", 1, "Magic value?", { revision: 4242, diffId: 42421 }), inlineTx(4302, "c.txt", 1, "Why a new file?", { revision: 4242, diffId: 42421 })] } });
  await expect(bar).toContainText("Work in 2 reviewer comments?", { timeout: 30_000 });
  await page.getByRole("button", { name: "Close session" }).click();
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
  await page.getByTestId("session-chip").click();
  await bar.getByRole("button", { name: "Work in" }).click();
  await expect(bar).toContainText("The self-review is done", { timeout: 60_000 });
  expect(readFileSync(join(dir, "c.txt"), "utf8")).toContain("kept");
  expect(git(dir, "log", "-1", "--format=%B")).toContain("Differential Revision: https://phab.example.com/D4242");
});

test("gecko: chat answers link local files to Searchfox at the branch base in a session without a Diff", async ({ page }) => {
  test.setTimeout(60_000);
  const dir = makeGeckoRepo();
  const base = git(dir, "rev-parse", "HEAD");
  await page.goto(open(dir));
  await page.getByLabel("start").fill("/implement IMPL-E2E make c.txt exist");
  await page.getByLabel("start").press("Enter");
  await expect(page).toHaveURL(/\/sessions\/[^/]+/);
  const conversation = page.getByRole("dialog", { name: "Session" });
  await expect(conversation.getByTestId("session-decision")).toBeVisible({ timeout: 20_000 });
  await conversation.getByLabel("message").fill("LOCAL-LINK-PLEASE");
  await conversation.getByRole("button", { name: "Send" }).click();
  const answer = conversation.locator(".msg.assistant", { hasText: "See " });
  await expect(answer.getByRole("link", { name: "a.txt" })).toHaveAttribute("href", `https://searchfox.org/mozilla-central/rev/${base}/a.txt#30`, { timeout: 20_000 });
  await expect(answer.getByRole("link", { name: "the spec" })).toHaveAttribute("href", "https://example.com/spec");
  await expect(answer.getByRole("link", { name: "missing" })).toHaveCount(0);
  await expect(answer.locator("code", { hasText: "missing" })).toBeVisible();
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
