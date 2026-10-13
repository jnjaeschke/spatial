// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Store } from "../../../src/runtime/store.ts";
import { Runtime } from "../../../src/runtime/tasks.ts";
import { makeGit } from "../../../src/runtime/git.ts";
import type { LlmPrompt, LlmService } from "../../../src/runtime/llm/types.ts";
import type { LlmSelection } from "../../../src/shared/types.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { geckoPlugin } from "../../../src/plugins/gecko/index.ts";
import type { TryProposalData } from "../../../src/plugins/gecko/shared/types.ts";
import { makeRepo } from "../../helpers/git-fixture.ts";

const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
function setup(json: unknown) {
  const repo = makeRepo();
  const base = repo.commit({ "dom/base/a.cpp": "a\n" }, "base");
  const head = repo.commit({ "dom/base/a.cpp": "b\n", "dom/base/test/test_a.html": "t\n" }, "Bug 1 - Change a");
  const store = new Store(":memory:");
  const prompts: LlmPrompt[] = [];
  let replyIndex = 0;
  const llm: LlmService = { defaultSelection: selection, async run(chosen, prompt) { prompts.push(prompt); return { text: "", json: Array.isArray(json) ? json[replyIndex++] : json, providerSessionId: "p", selection: chosen ?? selection }; }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } };
  const rt = new Runtime({ store, plugins: [specPlugin, reviewPlugin, implementPlugin, geckoPlugin], llm, git: makeGit });
  const session = store.createSession({ worktree: repo.dir, repoDir: join(repo.dir, ".git"), title: "t" });
  store.putArtifact({ sessionId: session.id, type: "CommandRun", status: "verified", provenance: { taskId: "t" }, data: { command: "./mach test dom/base/test/test_a.html", exitCode: 0, durationMs: 1, output: "", test: true } });
  store.putArtifact({ sessionId: session.id, type: "CommandRun", status: "verified", provenance: { taskId: "t" }, data: { command: "ls", exitCode: 0, durationMs: 1, output: "", test: false } });
  const run = () => rt.run<{ proposalId: string }>(session.id, "proposeTry", { base, head, llm: selection });
  return { repo, store, prompts, rt, session, run };
}

test("the proposal prompt names the commits, changed files and test commands; the proposal is stored as proposed", async () => {
  const { store, prompts, run } = setup({ command: "./mach try fuzzy --query 'dom/base mochitest'", reason: "Covers the changed test." });
  const out = await run();
  const proposal = store.getArtifact<TryProposalData>(out.proposalId);
  assert.equal(proposal.type, "TryProposal");
  assert.equal(proposal.status, "proposed");
  assert.deepEqual(proposal.data, { command: "./mach try fuzzy --query 'dom/base mochitest'", reason: "Covers the changed test." });
  const prompt = prompts[0]!.prompt;
  assert.match(prompt, /Bug 1 - Change a/);
  assert.match(prompt, /dom\/base\/test\/test_a\.html/);
  assert.match(prompt, /`\.\/mach test dom\/base\/test\/test_a\.html` \(exit 0\)/);
  assert.doesNotMatch(prompt, /`ls`/);
  assert.equal(prompts[0]!.tools, "read-only");
});

test("an unusable proposed command fails the task", async () => {
  const { run } = setup({ command: "./mach try fuzzy", reason: "r" });
  await assert.rejects(run(), /not usable: `\.\/mach try fuzzy` needs --query or --preset/);
  const { run: run2 } = setup({ command: 42 });
  await assert.rejects(run2(), /Try proposal reply failed validation/);
});

test("an invalid reply is repaired before storing the proposal", async () => {
  const { run, prompts, store } = setup([{ command: "./mach try fuzzy", reason: "r" }, { command: "./mach try auto", reason: "repaired" }]);
  const { proposalId } = await run();
  assert.equal(prompts.length, 2);
  assert.match(prompts[1]!.prompt, /previous answer was invalid/);
  assert.equal(store.getArtifact<TryProposalData>(proposalId).data.reason, "repaired");
});

test("earlier pushes of the session are offered for reuse", async () => {
  const { store, prompts, run, session } = setup({ command: "./mach try auto", reason: "r" });
  store.putArtifact({ sessionId: session.id, type: "TryPush", status: "verified", provenance: { taskId: "t" }, data: { command: "./mach try fuzzy --query 'dom/base mochitest'", url: "u", head: "h" } });
  await run();
  assert.match(prompts[0]!.prompt, /# Earlier try pushes in this session\n\n- `\.\/mach try fuzzy --query 'dom\/base mochitest'`/);
});

test("a proposal made in chat is stored without asking the LLM", async () => {
  const { store, prompts, rt, session } = setup(null);
  const out = await rt.run<{ proposalId: string }>(session.id, "proposeTry", { head: "h", proposal: { command: "./mach try auto", reason: "asked in chat" } });
  assert.equal(prompts.length, 0);
  assert.deepEqual(store.getArtifact<TryProposalData>(out.proposalId).data, { command: "./mach try auto", reason: "asked in chat" });
  await assert.rejects(rt.run(session.id, "proposeTry", { head: "h", proposal: { command: "./mach try fuzzy", reason: "r" } }), /not usable/);
});
