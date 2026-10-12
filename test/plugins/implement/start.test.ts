// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime, type SearchfoxCapability, type WebspecCapability } from "../../../src/runtime/tasks.ts";
import { makeGit } from "../../../src/runtime/git.ts";
import type { LlmService } from "../../../src/runtime/llm/types.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { implementWorkflow } from "../../../src/plugins/implement/workflow/implement.ts";
import type { ImplementBranchData } from "../../../src/plugins/implement/shared/types.ts";
import { makeRepo } from "../../helpers/git-fixture.ts";

const llm: LlmService = { defaultSelection: { backend: "claude", model: "m", effort: "low" }, async run() { throw new Error("unused"); }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } };
function setup() {
  const repo = makeRepo();
  const base = repo.commit({ "a.txt": "1\n" }, "base");
  const store = new Store(":memory:");
  const rt = new Runtime({ store, plugins: [specPlugin, reviewPlugin, implementPlugin], llm, git: makeGit, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const session = store.createSession({ worktree: repo.dir, repoDir: join(repo.dir, ".git"), title: "t" });
  const start = (input: object) => rt.run<{ branchId: string }>(session.id, "implementStart", input);
  return { repo, base, store, session, start };
}
const params = { request: "x", profile: null, checkout: null } as const;

test("parseArgs takes the whole argument as the request", () => {
  assert.deepEqual(implementWorkflow.parseArgs("  fix it  "), { ok: true, params: { request: "fix it", profile: null, checkout: null } });
  assert.deepEqual(implementWorkflow.parseArgs(" "), { ok: false, error: "Usage: /implement <what to fix or build>" });
});

test("start on a new branch records the branch, base and profile", async () => {
  const { repo, base, store, start } = setup();
  const { branchId } = await start({ request: "Fix the crash on close", profile: null, checkout: "new-branch" });
  const artifact = store.getArtifact<ImplementBranchData>(branchId);
  assert.equal(artifact.status, "verified");
  assert.deepEqual(artifact.data, { branch: "spatial/fix-the-crash-on-close", baseSha: base, baseRef: "main", profile: "plain-git", checkout: "new-branch" });
  assert.equal(repo.git("branch", "--show-current"), "spatial/fix-the-crash-on-close");
  repo.git("switch", "main");
  const second = await start({ request: "Fix the crash on close", profile: null, checkout: "new-branch" });
  assert.equal(store.getArtifact<ImplementBranchData>(second.branchId).data.branch, "spatial/fix-the-crash-on-close-2");
});

test("start on the current branch uses its fork point from main", async () => {
  const { repo, base, store, start } = setup();
  repo.git("switch", "-c", "feature");
  repo.commit({ "b.txt": "b\n" }, "work");
  const { branchId } = await start({ request: "x", profile: null, checkout: "current-branch" });
  assert.deepEqual(store.getArtifact<ImplementBranchData>(branchId).data, { branch: "feature", baseSha: base, baseRef: null, profile: "plain-git", checkout: "current-branch" });
});

test("start refuses a detached HEAD, an unknown profile and edits-only without a test command", async () => {
  const { repo, start } = setup();
  await assert.rejects(start({ request: "x", profile: "nope", checkout: "new-branch" }), /Unknown repo profile: nope/);
  await assert.rejects(start({ request: "x", profile: null, checkout: "new-branch", writeMode: "editsOnly" }), /Edits-only mode needs a test command/);
  repo.git("checkout", "--detach");
  await assert.rejects(start({ request: "x", profile: null, checkout: "current-branch" }), /detached/);
});

test("precheck asks only when the checkout is unclear and dirty or off main", async () => {
  const { repo } = setup();
  const precheck = implementWorkflow.precheck!;
  assert.equal(await precheck(repo.dir, params), null, "clean main");
  writeFileSync(join(repo.dir, "a.txt"), "changed\n");
  const dirty = (await precheck(repo.dir, params))!;
  assert.match(dirty.question, /uncommitted changes in 1 file/);
  assert.match(dirty.question, /main/);
  assert.deepEqual(dirty.options.map((option) => [option.label, option.params]), [
    ["Continue on this branch, keeping the changes", { checkout: "current-branch" }],
    ["New branch from the default branch, taking the changes along", { checkout: "new-branch" }],
    ["Cancel", undefined],
  ]);
  assert.equal(await precheck(repo.dir, { ...params, checkout: "new-branch" }), null, "clear checkout is never asked");
  repo.git("checkout", "--", "a.txt");
  repo.git("switch", "-c", "feature");
  assert.match((await precheck(repo.dir, params))!.question, /feature/);
});
