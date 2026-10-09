import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

const repoDirs: string[] = [];
test.afterEach(() => { for (const dir of repoDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

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
const open = (path: string) => `http://127.0.0.1:4178/?path=${encodeURIComponent(path)}`;

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
  await expect(page).toHaveURL(/\?session=/);

  const investigation = page.getByTestId("investigation");
  await expect(investigation).toContainText("The c file is missing.", { timeout: 20_000 });
  await expect(investigation).toContainText("1 location dropped");
  await expect(investigation).toContainText("Should d exist too?");
  await expect(investigation).toContainText("grep for c");
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

test("a dirty checkout asks before /implement starts and the changes move to the new branch", async ({ page }) => {
  const dir = makeRepo();
  writeFileSync(join(dir, "a.txt"), "dirty\n");
  await page.goto(open(dir));
  const box = page.getByLabel("start");
  await box.fill("/implement IMPL-E2E-ASK do it");
  await box.press("Enter");
  const question = page.getByTestId("start-question");
  await expect(question).toContainText("uncommitted changes in 1 file");
  await expect(page).not.toHaveURL(/\?session=/);
  await question.getByRole("button", { name: "Cancel" }).click();
  await expect(question).toHaveCount(0);
  await box.press("Enter");
  await question.getByRole("button", { name: /New branch/ }).click();
  await expect(page).toHaveURL(/\?session=/);
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
  await bar.getByRole("button", { name: "Accept" }).click();
  await expect(bar).toContainText(/Push [0-9a-f]{12} to try\?/, { timeout: 20_000 });
  await expect(page.getByTestId("try-proposal")).toContainText("Runs the plain mochitests.");
  await expect(bar.getByLabel("decision text")).toHaveValue("./mach try fuzzy --query 'mochitest-plain'");
  expect(existsSync(join(dir, ".git/mach-args"))).toBe(false);
  await bar.getByLabel("decision text").fill("./mach try fuzzy --query 'mochitest-plain' --artifact");
  await bar.getByRole("button", { name: "Push" }).click();
  await expect(bar).toContainText(/Submit 1 commit \([0-9a-f]{12}\) to Phabricator\?/, { timeout: 20_000 });
  await expect(bar.getByLabel("decision text")).toHaveValue("#dom-core");
  await expect(page.getByTestId("reviewer-suggestion")).toContainText("#dom-core");
  expect(existsSync(join(dir, ".git/moz-phab-args"))).toBe(false);

  await page.getByTestId("epoch-chip-5").click();
  await expect(page.getByTestId("try-failure")).toContainText("test-linux1804-64/opt-mochitest-plain-1", { timeout: 20_000 });
  await expect(page.getByTestId("try-failure")).toContainText("c is missing");
  await expect(page.getByTestId("try-headline")).toContainText("Finished: 3 done, 1 failing", { timeout: 20_000 });
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
  await expect(page).toHaveURL(/\?session=/);
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
