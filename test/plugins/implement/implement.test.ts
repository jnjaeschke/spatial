// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../../../src/runtime/store.ts";
import { KnowledgeStore } from "../../../src/runtime/knowledge.ts";
import { Runtime, type SearchfoxCapability, type WebspecCapability } from "../../../src/runtime/tasks.ts";
import { makeGit } from "../../../src/runtime/git.ts";
import type { LlmPrompt, LlmService } from "../../../src/runtime/llm/types.ts";
import type { Artifact, CommandRunData, LlmSelection } from "../../../src/shared/types.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import type { AcceptanceCheck, CheckResultsData, ImplementResultData, InvestigationData } from "../../../src/plugins/implement/shared/types.ts";
import type { ImplementInput } from "../../../src/plugins/implement/tasks/implement/task.ts";
import { makeRepo } from "../../helpers/git-fixture.ts";

const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
const ok = { summary: "done", planChange: null, planInvalid: null, step: null };
const investigation: InvestigationData = {
  kind: "bugfix", summary: "Sum", bug: null, locations: [], testCases: [], steps: [{ title: "Add b", message: "Add b", intent: "Adds b.", checks: [] }], openQuestions: [],
  exploration: [{ tried: "looked at a.txt", outcome: "nothing there" }],
};
const testProfilePlugin = { id: "tp", repoProfiles: [
  { id: "tp", description: "t", commitStyle: "single" as const, isTestCommand: (c: string) => c.startsWith("t ") },
  { id: "needs-bug", description: "b", commitStyle: "single" as const, requiresBug: true },
  { id: "checked", description: "c", commitStyle: "single" as const, testCommand: () => "true" },
  { id: "checked-stack", description: "c", commitStyle: "stack" as const, testCommand: () => "true" },
] };

function setup(agent: (call: number, prompt: LlmPrompt, repo: ReturnType<typeof makeRepo>) => unknown, profile = "plain-git", plan: InvestigationData = investigation, providerSessionId: (call: number) => string | undefined = (call) => `p${call + 1}`, knowledge?: KnowledgeStore) {
  const repo = makeRepo();
  const base = repo.commit({ "a.txt": "1\n" }, "base");
  repo.git("switch", "-c", "spatial/x");
  const store = new Store(":memory:");
  const prompts: LlmPrompt[] = [];
  const llm: LlmService = { defaultSelection: selection, async run(chosen, prompt) { prompts.push(prompt); return { text: "", json: agent(prompts.length - 1, prompt, repo), providerSessionId: providerSessionId(prompts.length - 1) as string, selection: chosen ?? selection }; }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } };
  const rt = new Runtime({ store, plugins: [specPlugin, reviewPlugin, implementPlugin, testProfilePlugin], llm, git: makeGit, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability, ...(knowledge ? { knowledge } : {}) });
  const session = store.createSession({ worktree: repo.dir, repoDir: join(repo.dir, ".git"), title: "t" });
  const put = (type: string, data: unknown) => store.putArtifact({ sessionId: session.id, type, status: "verified", data, provenance: { taskId: "t" } });
  const branch = put("ImplementBranch", { branch: "spatial/x", baseSha: base, baseRef: "main", profile, checkout: "new-branch" });
  const inv = put("Investigation", plan);
  const run = (input: Partial<ImplementInput> = {}) => rt.run<{ resultId: string }>(session.id, "implement", { branchId: branch.id, investigationId: inv.id, bug: null, text: null, fix: [], writeMode: "auto", ...input });
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

test("memories relevant to the implement phase and the investigation kind are in the prompt and recorded for the epoch", async () => {
  const knowledge = new KnowledgeStore(":memory:");
  const { store, session, prompts, run } = setup((_, __, r) => { r.commit({ "b.txt": "b\n" }, "Add b"); return ok; }, "plain-git", investigation, undefined, knowledge);
  const memory = (kinds: string[], wanted: string) => ({ situation: "the plan is a bug fix", observed: "o", wanted, why: "reviewers asked", phases: ["implement"], kinds, source: { sessionId: "S", epoch: 1, steer: "ST" } });
  knowledge.put(session.repoDir, "implement", "memory/for-bugfixes", memory(["bugfix"], "add the test first"), { by: "user", sessionId: "S" });
  knowledge.put(session.repoDir, "implement", "memory/for-features", memory(["feature"], "document the flag"), { by: "user", sessionId: "S" });
  store.createEpoch(session.id, "implement", null);
  await run({ llm: selection });
  assert.ok(prompts[0]!.prompt.includes("# How this user wants things done\n\n- When the plan is a bug fix: add the test first (reviewers asked)"));
  assert.ok(!prompts[0]!.prompt.includes("document the flag"));
  assert.equal(store.listArtifacts(session.id, "UsedMemories").length, 1);
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

test("the findings the round was asked to fix reach the agent, and no decision is written for them", async () => {
  const { store, session, prompts, put, run } = setup((_, __, r) => { r.commit({ "b.txt": "b\n" }, "Add b"); return ok; });
  const open = put("ReviewFinding", { anchor: "d#f0h0", severity: "high", title: "Leak", body: "It leaks.", category: "correctness" });
  put("ReviewFinding", { anchor: "d#f0h0", severity: "high", title: "Unrelated", body: "b", category: "correctness" });
  await run({ fix: [open.id] });
  assert.deepEqual(store.listArtifacts(session.id, "FindingDecision"), []);
  assert.ok(prompts[0]!.prompt.includes("# Findings to fix") && prompts[0]!.prompt.includes("Leak"));
  assert.ok(!prompts[0]!.prompt.includes("Unrelated"));
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

const withChecks = (...checks: AcceptanceCheck[]): InvestigationData => ({ ...investigation, steps: [{ ...investigation.steps[0]!, checks }] });
const event = (command: string, exitCode: number) => ({ kind: "command" as const, command, exitCode, durationMs: 1, output: exitCode ? "FAIL" : "ok" });

test("the first implement run needs a failing, then a passing run of the new test", async () => {
  const { prompts, run } = setup((call, prompt, r) => {
    if (call === 0) r.commit({ "b.txt": "b\n" }, "Add b");
    else { prompt.onEvent?.(event("t node t/a.js", 1)); prompt.onEvent?.(event("t node t/a.js", 0)); }
    return ok;
  }, "tp", withChecks({ kind: "new-test", path: "t/a.js" }));
  await run();
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1]!.prompt.includes("no run of a test command naming the test"));
});

test("a web-platform failing-test needs only a passing run", async () => {
  const path = "testing/web-platform/tests/dom/a.html";
  const { prompts, run } = setup((_, prompt, r) => { prompt.onEvent?.(event(`t wpt ${path}`, 0)); r.commit({ "b.txt": "b\n" }, "Add b"); return ok; }, "tp", withChecks({ kind: "failing-test", path, subtests: ["s"] }));
  await run();
  assert.equal(prompts.length, 1);
});

test("a measure check never blocks the run", async () => {
  const measure = withChecks({ kind: "measure", command: "bench", goal: "faster" });
  const good = setup((_, prompt, r) => {
    prompt.onEvent?.(event("bench", 0));
    prompt.onEvent?.({ kind: "progress", message: "editing b.txt" });
    r.commit({ "b.txt": "b\n" }, "Add b");
    prompt.onEvent?.(event("bench", 0));
    return ok;
  }, "tp", measure);
  await good.run();
  assert.equal(good.prompts.length, 1);
  const none = setup((_, __, r) => { r.commit({ "b.txt": "b\n" }, "Add b"); return ok; }, "tp", measure);
  await none.run();
  assert.equal(none.prompts.length, 1);
});

test("a later implement run needs test evidence only for tests it ran", async () => {
  const { base, prompts, put, run } = setup((_, __, r) => { r.commit({ "b.txt": "b\n" }, "Add b"); return ok; }, "tp", withChecks({ kind: "new-test", path: "t/a.js" }, { kind: "covering-test", path: "t/c.js" }));
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

test("a recorded stack rewrite lets the next implement run continue from the amended tip", async () => {
  const { repo, store, session, run } = setup((call, _, r) => {
    if (call === 0) r.commit({ "b.txt": "b\n" }, "Add b");
    return ok;
  });
  const { resultId } = await run();
  const from = store.getArtifact<ImplementResultData>(resultId).data.head;
  repo.git("commit", "--amend", "-m", "Add b", "-m", "Differential Revision: https://phab.example.com/D1");
  const to = repo.git("rev-parse", "HEAD").trim();
  store.putArtifact({ sessionId: session.id, type: "StackRewrite", status: "verified", data: { from, to, by: "moz-phab submit" }, provenance: { taskId: "test" } });
  await run();
});

test("an unrecorded stack rewrite still fails the moved-away guard", async () => {
  const { repo, run } = setup((call, _, r) => {
    if (call === 0) r.commit({ "b.txt": "b\n" }, "Add b");
    return ok;
  });
  await run();
  repo.git("commit", "--amend", "-m", "Add b", "-m", "Differential Revision: https://phab.example.com/D1");
  await assert.rejects(run(), /moved away from/);
});

test("edits-only fix rounds feed the problems back to the agent", async () => {
  const { repo, prompts, run } = setup((call, _, r) => {
    if (call === 0) return ok;
    writeFileSync(join(r.dir, "b.txt"), "fixed\n");
    return { ...ok, step: 0 };
  }, "checked");
  repo.commit({ "b.txt": "b\n" }, "Add b");
  await run({ writeMode: "editsOnly" });
  assert.equal(prompts.length, 2);
  assert.ok(prompts[1]!.prompt.includes("# Problems to fix") && prompts[1]!.prompt.includes("Name the commit"));
  assert.equal(prompts[1]!.resumeProviderSession, "p1");
  assert.ok(!prompts[1]!.prompt.includes("# Investigation"));
  assert.equal(repo.git("log", "--format=%s", "-1"), "Add b");
  assert.equal(repo.git("show", "HEAD:b.txt"), "fixed");
});

test("a verification retry resumes the previous attempt's session with only the problems", async () => {
  const { prompts, run } = setup((call, _, r) => {
    if (call === 0) { r.commit({ "b.txt": "b\n" }, "Add b"); writeFileSync(join(r.dir, "stray.txt"), "x\n"); }
    else { r.git("add", "-A"); r.git("commit", "-q", "--amend", "--no-edit"); }
    return ok;
  });
  await run();
  assert.equal(prompts[0]!.resumeProviderSession, undefined);
  assert.equal(prompts[1]!.resumeProviderSession, "p1");
  assert.ok(prompts[1]!.prompt.startsWith("# Problems to fix") && prompts[1]!.prompt.includes("uncommitted"));
  assert.ok(!prompts[1]!.prompt.includes("# Investigation"));
});

test("every verification attempt stores CheckResults naming the command runs that prove each check", async () => {
  const { store, session, run } = setup((call, prompt, r) => {
    if (call === 0) r.commit({ "b.txt": "b\n" }, "Add b");
    else { prompt.onEvent?.(event("t node t/a.js", 1)); prompt.onEvent?.(event("t node t/a.js", 0)); }
    return ok;
  }, "tp", withChecks({ kind: "new-test", path: "t/a.js" }));
  await run();
  const stored = store.listArtifacts(session.id, "CheckResults");
  assert.equal(stored.length, 2);
  assert.ok(stored.every((a) => a.status === "verified"));
  const [early, final] = stored.map((a) => (a.data as CheckResultsData).results);
  assert.equal(early![0]!.ok, false);
  const runIds = store.listArtifacts(session.id, "CommandRun").map((a) => a.id);
  assert.deepEqual(final, [{ step: 0, check: 0, label: "new-test t/a.js", ok: true, message: "2 runs, the last passed", runs: runIds }]);
});

test("a measure check is reported with its runs and never blocks", async () => {
  const { store, session, run } = setup((_, prompt, r) => {
    prompt.onEvent?.(event("bench", 0));
    prompt.onEvent?.({ kind: "progress", message: "editing b.txt" });
    r.commit({ "b.txt": "b\n" }, "Add b");
    prompt.onEvent?.(event("bench", 0));
    return ok;
  }, "tp", withChecks({ kind: "measure", command: "bench", goal: "faster" }));
  await run();
  const results = (store.listArtifacts(session.id, "CheckResults").at(-1)!.data as CheckResultsData).results;
  assert.deepEqual(results.map((r) => [r.ok, r.message, r.runs.length]), [[true, "2 runs: before and after the first edit", 2]]);
});

test("no CheckResults are stored when no check was judged", async () => {
  const { store, session, run } = setup((_, __, r) => { r.commit({ "b.txt": "b\n" }, "Add b"); return ok; });
  await run();
  assert.equal(store.listArtifacts(session.id, "CheckResults").length, 0);
});

test("a later implement call uses the follow-up prompt even when the first call has no session id", async () => {
  const { prompts, run } = setup((call, _, repo) => {
    if (call === 1) repo.commit({ "b.txt": "b\n" }, "Add b");
    return ok;
  }, "plain-git", investigation, (call) => call === 0 ? undefined : `p${call + 1}`);
  await run();
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0]!.resumeProviderSession, undefined);
  assert.equal(prompts[1]!.resumeProviderSession, undefined);
  assert.ok(prompts[1]!.prompt.startsWith("# Problems to fix"));
  assert.ok(!prompts[1]!.prompt.includes("# Investigation"));
});

const twoSteps: InvestigationData = { ...investigation, kind: "feature", steps: [{ title: "Add b", message: "Add b", intent: "i", checks: [] }, { title: "Add c", message: "Add c", intent: "i", checks: [] }] };

test("edits-only resumes the previous call's session for the next plan step", async () => {
  const { prompts, run } = setup((call, _, r) => { writeFileSync(join(r.dir, call === 0 ? "b.txt" : "c.txt"), "x\n"); return ok; }, "checked-stack", twoSteps);
  await run({ writeMode: "editsOnly" });
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0]!.resumeProviderSession, undefined);
  assert.equal(prompts[1]!.resumeProviderSession, "p1");
  assert.ok(prompts[1]!.prompt.includes("Implement ONLY plan step 2 of 2") && !prompts[1]!.prompt.includes("# Investigation"));
});

test("each provider session id is recorded once as a verified AgentSession", async () => {
  const { store, session, run } = setup((call, prompt, r) => {
    for (let i = 0; i < 2; i++) prompt.onEvent?.({ kind: "session", providerSessionId: `s${call}` });
    if (call === 0) { r.commit({ "b.txt": "b\n" }, "Add b"); writeFileSync(join(r.dir, "stray.txt"), "x\n"); }
    else { r.git("add", "-A"); r.git("commit", "-q", "--amend", "--no-edit"); }
    return ok;
  });
  await run({ llm: selection });
  assert.deepEqual(store.listArtifacts(session.id, "AgentSession").map((a) => [a.status, a.data]), [
    ["verified", { providerSessionId: "s0", backend: "claude", model: "sonnet", resumed: false }],
    ["verified", { providerSessionId: "s1", backend: "claude", model: "sonnet", resumed: true }],
  ]);
});

test("a run that fails after its session started leaves the AgentSession behind", async () => {
  const { store, session, run } = setup((_, prompt) => { prompt.onEvent?.({ kind: "session", providerSessionId: "s0" }); throw new Error("boom"); });
  await assert.rejects(run(), /boom/);
  assert.equal(store.listArtifacts(session.id, "AgentSession").length, 1);
});

test("edits-only continues past a reported invalid plan when the user chose to continue", async () => {
  const { repo, store, prompts, run } = setup((_, __, r) => { writeFileSync(join(r.dir, "b.txt"), "b\n"); return { ...ok, planInvalid: "still wrong" }; }, "checked");
  const { resultId } = await run({ writeMode: "editsOnly", ignorePlanInvalid: true });
  assert.equal(prompts.length, 1);
  assert.equal(store.getArtifact<ImplementResultData>(resultId).data.planInvalid, null);
  assert.equal(repo.git("log", "--format=%s", "-1"), "Add b");
});

test("edits-only stores CheckResults from the runs the runtime made", async () => {
  const { store, session, run } = setup((_, __, r) => { writeFileSync(join(r.dir, "b.txt"), "b\n"); return ok; }, "checked", withChecks({ kind: "covering-test", path: "t/c.js" }, { kind: "measure", command: "bench", goal: "faster" }));
  await run({ writeMode: "editsOnly" });
  const stored = store.listArtifacts(session.id, "CheckResults");
  assert.equal(stored.length, 1);
  const runs = store.listArtifacts(session.id, "CommandRun").map((a) => a.id);
  assert.deepEqual((stored[0]!.data as CheckResultsData).results, [
    { step: 0, check: 0, label: "covering-test t/c.js", ok: true, message: "passed", runs },
    { step: 0, check: 1, label: "measure `bench` - faster", ok: true, message: "not run in edits-only mode", runs: [] },
  ]);
});

test("after a steer the agent resumes its stopped session with only the steer", async () => {
  const { store, session, put, prompts, run } = setup((_, prompt, r) => {
    prompt.onEvent?.({ kind: "session", providerSessionId: "p-2" });
    r.commit({ "b.txt": "b\n" }, "Add b");
    return ok;
  });
  store.createEpoch(session.id, "implement", null);
  put("AgentSession", { providerSessionId: "p-1", backend: "claude", model: "sonnet", resumed: false });
  put("Steer", { text: "use a helper", epoch: 1, phase: "implement" });
  await run({ llm: selection });
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0]!.resumeProviderSession, "p-1");
  assert.equal(prompts[0]!.prompt, "# The user stopped you and said\n\nuse a helper\n\nThe work tree may hold edits from the stopped run.");
  const latest = store.listArtifacts(session.id, "AgentSession").at(-1)!.data as { providerSessionId: string; resumed: boolean };
  assert.deepEqual([latest.providerSessionId, latest.resumed], ["p-2", true]);
});

test("a steer without a stopped session restarts the agent with the steer in its full prompt", async () => {
  const { store, session, put, prompts, run } = setup((_, prompt, r) => {
    prompt.onEvent?.({ kind: "session", providerSessionId: "p-3" });
    r.commit({ "b.txt": "b\n" }, "Add b");
    return ok;
  });
  store.createEpoch(session.id, "implement", null);
  put("Steer", { text: "use a helper", epoch: 1, phase: "implement" });
  await run({ llm: selection });
  assert.equal(prompts[0]!.resumeProviderSession, undefined);
  assert.ok(prompts[0]!.prompt.startsWith("# The user stopped you and said\n\nuse a helper"));
  assert.ok(prompts[0]!.prompt.includes("# Investigation"));
  const latest = store.listArtifacts(session.id, "AgentSession").at(-1)!.data as { resumed: boolean };
  assert.equal(latest.resumed, false);
});
