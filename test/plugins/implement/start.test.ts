// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { testRuntime } from "../../helpers/runtime.ts";
import { makeGit } from "../../../src/runtime/git/read.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { implementWorkflow } from "../../../src/plugins/implement/workflow/implement.ts";
import type { ImplementBranchData } from "../../../src/plugins/implement/shared/types.ts";
import { makeRepo } from "../../helpers/git-fixture.ts";

function setup() {
  const repo = makeRepo();
  const base = repo.commit({ "a.txt": "1\n" }, "base");
  const { rt, store, session } = testRuntime({ plugins: [specPlugin, reviewPlugin, implementPlugin], git: makeGit, session: { worktree: repo.dir, repoDir: join(repo.dir, ".git") } });
  const start = ({ profile, ...input }: { profile?: string } & Record<string, unknown>) => {
    store.putArtifact({ sessionId: session.id, type: "WorkflowStart", status: "verified", data: { via: "command", workflow: "implement", profile: profile ?? "plain-git", params: { request: "x", profile: null, checkout: null }, title: "t", prompt: "x" }, provenance: { taskId: "t" } });
    return rt.run<{ branchId: string }>(session.id, "implementStart", input);
  };
  return { repo, base, store, rt, session, start };
}
const params = { request: "x", profile: null, checkout: null } as const;

test("parseArgs takes the whole argument as the request", () => {
  assert.deepEqual(implementWorkflow.parseArgs("  fix it  "), { ok: true, params: { request: "fix it", profile: null, checkout: null } });
  assert.deepEqual(implementWorkflow.parseArgs(" "), { ok: false, error: "Usage: /implement <what to fix or build>" });
});

test("start on a new branch records the branch and base", async () => {
  const { repo, base, store, start } = setup();
  const { branchId } = await start({ request: "Fix the crash on close", checkout: "new-branch" });
  const artifact = store.getArtifact<ImplementBranchData>(branchId);
  assert.equal(artifact.status, "verified");
  assert.deepEqual(artifact.data, { branch: "spatial/fix-the-crash-on-close", baseSha: base, baseRef: "main", checkout: "new-branch" });
  assert.equal(repo.git("branch", "--show-current"), "spatial/fix-the-crash-on-close");
  repo.git("switch", "main");
  const second = await start({ request: "Fix the crash on close", checkout: "new-branch" });
  assert.equal(store.getArtifact<ImplementBranchData>(second.branchId).data.branch, "spatial/fix-the-crash-on-close-2");
});

test("start on the current branch uses its fork point from main", async () => {
  const { repo, base, store, start } = setup();
  repo.git("switch", "-c", "feature");
  repo.commit({ "b.txt": "b\n" }, "work");
  const { branchId } = await start({ request: "x", checkout: "current-branch" });
  assert.deepEqual(store.getArtifact<ImplementBranchData>(branchId).data, { branch: "feature", baseSha: base, baseRef: null, checkout: "current-branch" });
});

test("start refuses a detached HEAD and edits-only without a test command", async () => {
  const { repo, start } = setup();
  await assert.rejects(start({ request: "x", checkout: "new-branch", writeMode: "editsOnly" }), /Edits-only mode needs a test command/);
  repo.git("checkout", "--detach");
  await assert.rejects(start({ request: "x", checkout: "current-branch" }), /detached/);
});

test("precheck offers adopt on a branch with commits beyond its fork", async () => {
  const { repo, rt } = setup();
  repo.git("switch", "-c", "topic");
  repo.commit({ "b.txt": "work\n" }, "work");
  const question = await implementWorkflow.precheck!(repo.dir, params, rt);
  assert.deepEqual(question?.options.map((option) => [option.label, option.params]), [
    ["Adopt the work on topic (its commits and review rounds)", { checkout: "adopt-branch" }],
    ["Continue on topic", { checkout: "current-branch" }],
    ["Start fresh on a new branch from the default branch", { checkout: "new-branch" }],
    ["Cancel", undefined],
  ]);
  writeFileSync(join(repo.dir, "a.txt"), "changed\n");
  const dirty = await implementWorkflow.precheck!(repo.dir, params, rt);
  assert.equal(dirty?.options[0]?.label, "Adopt the work on topic (its commits and review rounds) with the uncommitted changes");
  repo.git("switch", "main");
  const noAhead = await implementWorkflow.precheck!(repo.dir, params, rt);
  assert.equal(noAhead?.options.some((option) => option.params?.checkout === "adopt-branch"), false);
});

test("start adopts the current branch after implementStart", async () => {
  const calls: unknown[][] = [];
  const rt = {
    store: { getSession: () => ({ worktree: "/repo" }), getArtifact: () => ({ data: { writeMode: null } }), listSessions: () => [] },
    run: async (...args: unknown[]) => { calls.push(["run", ...args]); },
    runPhase: async (...args: unknown[]) => { calls.push(["runPhase", ...args]); },
  } as unknown as Parameters<NonNullable<typeof implementWorkflow.start>>[0];
  await implementWorkflow.start!(rt, "s", { params: { request: "take over", profile: null, checkout: "adopt-branch" }, startId: "start", prompt: "take over" });
  assert.deepEqual(calls.map((call) => call.slice(0, 3)), [
    ["run", "s", "implementStart"],
    ["runPhase", "s", "adopt"],
  ]);
  assert.deepEqual(calls[0]![3], { request: "take over", checkout: "current-branch" });
  assert.deepEqual(calls[1]![3], { mode: "moved" });
});

test("precheck asks only when the checkout is unclear and dirty or off main", async () => {
  const { repo, rt } = setup();
  const precheck = (dir: string, p: typeof params | { request: string; profile: null; checkout: "new-branch" }) => implementWorkflow.precheck!(dir, p, rt);
  assert.equal(await precheck(repo.dir, params), null, "clean main");
  writeFileSync(join(repo.dir, "a.txt"), "changed\n");
  const dirty = (await precheck(repo.dir, params))!;
  assert.match(dirty.question, /uncommitted changes in 1 file/);
  assert.match(dirty.question, /main/);
  assert.deepEqual(dirty.options.map((option) => [option.label, option.params]), [
    ["Continue on main with the uncommitted changes", { checkout: "current-branch" }],
    ["New branch from the default branch, carrying the uncommitted changes over", { checkout: "new-branch" }],
    ["Cancel", undefined],
  ]);
  assert.equal(await precheck(repo.dir, { ...params, checkout: "new-branch" }), null, "clear checkout is never asked");
  repo.git("checkout", "--", "a.txt");
  repo.git("switch", "-c", "feature");
  const offMain = (await precheck(repo.dir, params))!;
  assert.match(offMain.question, /feature/);
  assert.deepEqual(offMain.options.map((option) => option.label), ["Continue on feature", "Start fresh on a new branch from the default branch", "Cancel"]);
  repo.git("checkout", "--detach");
  assert.deepEqual((await precheck(repo.dir, params))!.options.map((option) => option.label), ["Start fresh on a new branch from the default branch", "Cancel"], "a detached HEAD cannot be continued on");
});
