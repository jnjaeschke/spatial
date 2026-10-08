// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime, type SearchfoxCapability, type WebspecCapability } from "../../../src/runtime/tasks.ts";
import { makeGit } from "../../../src/runtime/git.ts";
import type { LlmPrompt, LlmService } from "../../../src/runtime/llm/types.ts";
import type { Artifact, LlmSelection } from "../../../src/shared/types.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import type { CommandRunData, ImplementResultData, InvestigationData } from "../../../src/plugins/implement/shared/types.ts";
import type { ImplementInput } from "../../../src/plugins/implement/tasks/implement/task.ts";
import { makeRepo } from "../../helpers/git-fixture.ts";

const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
const ok = { summary: "done", planChange: null, planInvalid: null, step: null };
const investigation: InvestigationData = {
  kind: "bugfix", summary: "Sum", bug: null, locations: [], testCases: [], steps: [{ title: "Add b", message: "Add b", intent: "Adds b.", tests: [] }], openQuestions: [],
  exploration: [{ tried: "looked at a.txt", outcome: "nothing there" }],
};
const testProfilePlugin = { id: "tp", repoProfiles: [
  { id: "tp", description: "t", commitStyle: "single" as const, isTestCommand: (c: string) => c.startsWith("t ") },
  { id: "needs-bug", description: "b", commitStyle: "single" as const, requiresBug: true },
] };

function setup(agent: (call: number, prompt: LlmPrompt, repo: ReturnType<typeof makeRepo>) => unknown, profile = "plain-git", plan: InvestigationData = investigation) {
  const repo = makeRepo();
  const base = repo.commit({ "a.txt": "1\n" }, "base");
  repo.git("switch", "-c", "spatial/x");
  const store = new Store(":memory:");
  const prompts: LlmPrompt[] = [];
  const llm: LlmService = { defaultSelection: selection, async run(chosen, prompt) { prompts.push(prompt); return { text: "", json: agent(prompts.length - 1, prompt, repo), providerSessionId: "p", selection: chosen ?? selection }; }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } };
  const rt = new Runtime({ store, plugins: [reviewPlugin, implementPlugin, testProfilePlugin], llm, git: makeGit, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const session = store.createSession({ worktree: repo.dir, repoDir: join(repo.dir, ".git"), title: "t" });
  const put = (type: string, data: unknown) => store.putArtifact({ sessionId: session.id, type, status: "verified", data, provenance: { taskId: "t" } });
  const branch = put("ImplementBranch", { branch: "spatial/x", baseSha: base, baseRef: "main", profile, checkout: "new-branch" });
  const inv = put("Investigation", plan);
  const run = (input: Partial<ImplementInput> = {}) => rt.run<{ resultId: string }>(session.id, "implement", { branchId: branch.id, investigationId: inv.id, bug: null, text: null, writeMode: "auto", ...input });
  return { repo, base, store, session, prompts, put, run };
}
const results = (store: Store, id: string) => store.listArtifacts(id, "ImplementResult") as Artifact<ImplementResultData>[];

test("the agent edits and commits; the result records the verified tip", async () => {
  const { repo, store, session, prompts, run } = setup((_, __, r) => { r.commit({ "b.txt": "b\n" }, "Add b"); return ok; });
  const { resultId } = await run({ llm: selection });
  const result = store.getArtifact<ImplementResultData>(resultId);
  assert.deepEqual(result.data, { head: repo.git("rev-parse", "HEAD"), branch: "spatial/x", summary: "done", planChange: null, planInvalid: null });
  assert.equal(result.status, "verified");
  assert.equal(prompts[0]!.tools, "write");
  assert.equal(prompts[0]!.writeMode, "auto");
  assert.ok(prompts[0]!.system!.startsWith("You implement a planned code change"));
  for (const text of ["# Investigation", "looked at a.txt", "nothing there", "spatial/x"]) assert.ok(prompts[0]!.prompt.includes(text), text);
  assert.equal(results(store, session.id).length, 1);
});

test("shell commands become CommandRun artifacts and progress lines", async () => {
  const { store, session, run } = setup((_, prompt, r) => {
    prompt.onEvent?.({ kind: "progress", message: "editing b.txt" });
    prompt.onEvent?.({ kind: "command", command: "t suite", exitCode: 1, durationMs: 12, output: "FAIL" });
    prompt.onEvent?.({ kind: "command", command: "ls", exitCode: 0, durationMs: 3, output: "a.txt" });
    r.commit({ "b.txt": "b\n" }, "Add b");
    return ok;
  }, "tp");
  await run();
  const runs = store.listArtifacts(session.id, "CommandRun") as Artifact<CommandRunData>[];
  assert.deepEqual(runs.map((a) => a.data), [
    { command: "t suite", exitCode: 1, durationMs: 12, output: "FAIL", test: true },
    { command: "ls", exitCode: 0, durationMs: 3, output: "a.txt", test: false },
  ]);
  assert.ok(runs.every((a) => a.status === "verified" && a.epoch === null));
});

test("a failing verification is fed back and the agent retries", async () => {
  const { repo, prompts, run } = setup((call, _, r) => {
    if (call === 0) { r.commit({ "b.txt": "b\n" }, "Add b"); writeFileSync(join(r.dir, "stray.txt"), "x\n"); }
    else { r.git("add", "-A"); r.git("commit", "-q", "--amend", "--no-edit"); }
    return ok;
  });
  await run();
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1]!.prompt.includes("# Problems to fix") && prompts[1]!.prompt.includes("uncommitted"));
  assert.equal(repo.git("status", "--porcelain"), "");
});

test("the epoch fails after two verification retries", async () => {
  const { prompts, run } = setup(() => ok);
  await assert.rejects(run(), /still has problems after 2 retries/);
  assert.equal(prompts.length, 3);
});

test("a plan that does not hold is reported without verification", async () => {
  const { store, session, prompts, run } = setup(() => ({ ...ok, planInvalid: "The API does not exist" }));
  const { resultId } = await run();
  assert.equal(store.getArtifact<ImplementResultData>(resultId).data.planInvalid, "The API does not exist");
  assert.equal(prompts.length, 1);
  assert.equal(results(store, session.id).length, 1);
});

test("continuing anyway tells the agent not to report the plan invalid", async () => {
  const { prompts, run } = setup((_, __, r) => { r.commit({ "b.txt": "b\n" }, "Add b"); return ok; });
  await run({ ignorePlanInvalid: true, text: "go on" });
  assert.ok(prompts[0]!.prompt.includes("Do not report the plan as invalid"));
  assert.ok(prompts[0]!.prompt.includes("# Revision request") && prompts[0]!.prompt.includes("go on"));
});

test("open high findings are accepted before the agent runs", async () => {
  const { store, session, prompts, put, run } = setup((_, __, r) => { r.commit({ "b.txt": "b\n" }, "Add b"); return ok; });
  const open = put("ReviewFinding", { anchor: "d#f0h0", severity: "high", title: "Leak", body: "It leaks.", category: "correctness" });
  const closed = put("ReviewFinding", { anchor: "d#f0h0", severity: "high", title: "Fixed", body: "b", category: "correctness" });
  const verdict = put("FindingVerdict", { finding: closed.id, verdict: "addressed", reason: "r" });
  store.putLink({ sessionId: session.id, from: verdict.id, to: closed.id, kind: "about" });
  await run();
  const decisions = store.listArtifacts(session.id, "FindingDecision");
  assert.deepEqual(decisions.map((d) => d.data), [{ finding: open.id, decision: "accepted" }]);
  assert.ok(store.listLinks(session.id).some((l) => l.from === decisions[0]!.id && l.to === open.id && l.kind === "about"));
  assert.ok(prompts[0]!.prompt.includes("# Findings to fix") && prompts[0]!.prompt.includes("Leak"));
  assert.ok(!prompts[0]!.prompt.includes("Fixed"));
});

test("notes and chat threads since the last implement run reach the agent", async () => {
  const { store, session, prompts, put, run } = setup((_, __, r) => { r.commit({ "b.txt": "b\n" }, "Add b"); return ok; });
  put("Note", { body: "remember the edge case" });
  const thread = put("ChatThread", { anchor: "x" });
  const message = put("ChatMessage", { role: "user", text: "what about empty input?" });
  store.putLink({ sessionId: session.id, from: message.id, to: thread.id, kind: "reply" });
  await run();
  assert.ok(prompts[0]!.prompt.includes("remember the edge case") && prompts[0]!.prompt.includes("what about empty input?"));
});

const withTests = { ...investigation, steps: [{ ...investigation.steps[0]!, tests: ["t/a.js"] }] };

test("the first implement run needs a failing, then a passing run of the new test", async () => {
  const { prompts, run } = setup((call, prompt, r) => {
    if (call === 0) r.commit({ "b.txt": "b\n" }, "Add b");
    else {
      prompt.onEvent?.({ kind: "command", command: "t node t/a.js", exitCode: 1, durationMs: 1, output: "FAIL" });
      prompt.onEvent?.({ kind: "command", command: "t node t/a.js", exitCode: 0, durationMs: 1, output: "ok" });
    }
    return ok;
  }, "tp", withTests);
  await run();
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1]!.prompt.includes("no run of a test command naming the test"));
});

test("a later implement run does not need test evidence", async () => {
  const { base, prompts, put, run } = setup((_, __, r) => { r.commit({ "b.txt": "b\n" }, "Add b"); return ok; }, "tp", withTests);
  put("ImplementResult", { head: base, branch: "spatial/x", summary: "", planChange: null, planInvalid: null });
  await run();
  assert.equal(prompts.length, 1);
});

test("a profile that requires a bug needs one", async () => {
  const { run } = setup(() => ok, "needs-bug");
  await assert.rejects(run({ bug: null }), /needs a bug number/);
});

test("the checkout must still be on the branch and descend from the last result", async () => {
  const { repo, base, put, run } = setup(() => ok);
  repo.git("switch", "-c", "other", base);
  const other = repo.commit({ "x.txt": "x\n" }, "other");
  repo.git("switch", "spatial/x");
  put("ImplementResult", { head: other, branch: "spatial/x", summary: "", planChange: null, planInvalid: null });
  await assert.rejects(run(), /moved/);
  repo.git("switch", "main");
  await assert.rejects(run(), /not on spatial\/x/);
});
