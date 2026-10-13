import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git, makeRepo } from "./repo.ts";
import { test, expect } from "@playwright/test";
import { newRevision } from "./revisions.ts";

const repoDirs: string[] = [];

test.afterEach(() => {
  for (const dir of repoDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("reviews a Phabricator revision that is not checked out and leaves the repo untouched", async ({ page, request }) => {
  const ids = newRevision();
  const dir = makeRepo("spatial-remote-", { "a.txt": `${Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n")}\n` });
  repoDirs.push(dir);
  const base = git(dir, "rev-parse", "HEAD");

  const scratch = mkdtempSync(join(tmpdir(), "spatial-remote-scratch-"));
  repoDirs.push(scratch);
  execFileSync("git", ["clone", "-q", dir, scratch]);
  const lines = readFileSync(join(scratch, "a.txt"), "utf8").trimEnd().split("\n");
  lines[29] = "THIRTY";
  writeFileSync(join(scratch, "a.txt"), `${lines.join("\n")}\n`);
  writeFileSync(join(scratch, "c.txt"), "c\n");
  execFileSync("git", ["-C", scratch, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "add", "-A"]);
  execFileSync("git", ["-C", scratch, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "commit", "-m", "Bug 1 - Remote change"]);
  const raw = execFileSync("git", ["-C", scratch, "diff", base, "HEAD"], { encoding: "utf8" });
  const control = await request.post("http://127.0.0.1:4179/control", { data: { revision: ids.revision, title: "Bug 1 - Remote change", base, diffs: [ids.d1], rawDiffs: { [ids.d1]: raw } } });
  expect(control.ok()).toBeTruthy();
  const title = `remote-${crypto.randomUUID()}`;
  const session = await (await request.post("http://127.0.0.1:4178/api/sessions", { data: { repo: dir, title } })).json() as { id: string };

  const snapshot = () => ({
    head: git(dir, "rev-parse", "HEAD"), branch: git(dir, "symbolic-ref", "HEAD"), status: git(dir, "status", "--porcelain"),
    branches: git(dir, "branch", "--list"), heads: git(dir, "for-each-ref", "refs/heads", "refs/tags", "refs/remotes"),
    index: readFileSync(join(dir, ".git", "index")), files: readdirSync(dir).sort(),
  });
  const before = snapshot();
  const response = await request.post(`http://127.0.0.1:4178/api/sessions/${session.id}/import-revision`, { data: { host: "https://phab.example.com", id: ids.revision } });
  expect(response.status()).toBe(202);
  const range = await response.json() as { base: string; head: string };
  expect(range.base).toBe(base);

  await page.goto("http://127.0.0.1:4178/");
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByTestId("change-c1")).toBeVisible({ timeout: 15_000 });

  expect(snapshot()).toEqual(before);
  expect(git(dir, "log", "-1", "--format=%B", range.head)).toContain(`Differential Revision: https://phab.example.com/D${ids.revision}`);
  expect(git(dir, "for-each-ref", "refs/spatial")).toContain(`refs/spatial/D${ids.revision}/${ids.d1}-${range.head.slice(0, 12)}`);
  const state = await (await request.get(`http://127.0.0.1:4178/api/sessions/${session.id}/state`)).json() as { artifacts: { type: string; data: { baseSha?: string; headSha?: string } }[] };
  const diff = state.artifacts.find((artifact) => artifact.type === "Diff")!.data;
  expect(diff.baseSha).toBe(base);
  expect(diff.headSha).toBe(range.head);
  await expect(page.getByTestId("summary")).toContainText("Edits a and adds c.");
});

test("a revision whose base commit is not in the repo is refused without writing anything", async ({ request }) => {
  const ids = newRevision();
  const dir = makeRepo("spatial-remote-missing-base-", { "a.txt": "base\n" });
  repoDirs.push(dir);
  const head = git(dir, "rev-parse", "HEAD");
  const missingBase = "e".repeat(40);
  const control = await request.post("http://127.0.0.1:4179/control", { data: { revision: ids.revision, base: missingBase, diffs: [ids.d1], rawDiffs: { [ids.d1]: "diff --git a/x b/x\n" } } });
  expect(control.ok()).toBeTruthy();
  const title = `remote-missing-base-${crypto.randomUUID()}`;
  const session = await (await request.post("http://127.0.0.1:4178/api/sessions", { data: { repo: dir, title } })).json() as { id: string };
  const response = await request.post(`http://127.0.0.1:4178/api/sessions/${session.id}/import-revision`, { data: { host: "https://phab.example.com", id: ids.revision } });
  expect(response.status()).toBe(409);
  const body = await response.json() as { error: string };
  expect(body.error).toMatch(new RegExp(`Base commit ${missingBase} of D${ids.revision}`));
  expect(body.error).toMatch(/Fetch it/);
  expect(git(dir, "for-each-ref", "refs/spatial")).toBe("");
  expect(git(dir, "rev-parse", "HEAD")).toBe(head);
});
import { execFileSync } from "node:child_process";
