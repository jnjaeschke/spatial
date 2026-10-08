import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
