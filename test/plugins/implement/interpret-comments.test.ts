// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Store } from "../../../src/runtime/store.ts";
import { KnowledgeStore } from "../../../src/runtime/knowledge.ts";
import { Runtime, type SearchfoxCapability, type WebspecCapability } from "../../../src/runtime/tasks.ts";
import { makeGit } from "../../../src/runtime/git.ts";
import type { LlmPrompt, LlmService } from "../../../src/runtime/llm/types.ts";
import type { LlmSelection } from "../../../src/shared/types.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import type { PhabCommentData } from "../../../src/plugins/review/api.ts";
import type { CommentInterpretationData } from "../../../src/plugins/implement/shared/types.ts";
import { makeRepo } from "../../helpers/git-fixture.ts";

const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
const response = (phids = ["PHID-XCMT-1", "PHID-XCMT-2"]) => ({ comments: phids.map((phid) => phid === "PHID-XCMT-1"
  ? { phid, asks: "Name the constant", proposal: "const kMax = 30", action: "address", reply: null }
  : { phid, asks: "Why not X?", proposal: "None", action: "reply", reply: "X breaks Y." }) });
function setup(json: unknown, knowledge?: KnowledgeStore) {
  const repo = makeRepo();
  repo.commit({ "dom/a.cpp": "const int kMax = 20;\n" }, "base");
  const store = new Store(":memory:");
  const prompts: LlmPrompt[] = [];
  const llm: LlmService = { defaultSelection: selection, async run(chosen, prompt) { prompts.push(prompt); return { text: "", json, providerSessionId: "p", selection: chosen ?? selection }; }, async listModels() { return { claude: { models: [] }, codex: { models: [] } }; } };
  const rt = new Runtime({ store, plugins: [specPlugin, reviewPlugin, implementPlugin], llm, git: makeGit, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability, ...(knowledge ? { knowledge } : {}) });
  const session = store.createSession({ worktree: repo.dir, repoDir: join(repo.dir, ".git"), title: "comments" });
  const add = (data: PhabCommentData) => store.putArtifact({ sessionId: session.id, type: "PhabComment", status: "verified", data, provenance: { taskId: "test" } });
  const first = add({ revision: 7, phid: "PHID-XCMT-1", version: 1, author: "alice", bot: false, byMe: false, body: "Please name the constant.", path: "dom/a.cpp", line: 12, length: 1, quote: "const int kMax = 20;", diffId: 70, isNewFile: true, own: false, done: false, txId: 1, dateCreated: 1 });
  const second = add({ revision: 7, phid: "PHID-XCMT-2", version: 1, author: "bob", bot: false, byMe: false, body: "Why not X?", own: false, done: false, txId: 2, dateCreated: 2 });
  return { repo, store, session, prompts, rt, first, second };
}

test("interpretComments records one private interpretation per comment with read-only context", async () => {
  const { store, session, prompts, rt, first, second } = setup(response());
  const out = await rt.run<{ interpretationIds: string[] }>(session.id, "interpretComments", { comments: ["PHID-XCMT-1", "PHID-XCMT-2"] });
  assert.equal(out.interpretationIds.length, 2);
  const interpretations = out.interpretationIds.map((id) => store.getArtifact<CommentInterpretationData>(id));
  assert.deepEqual(interpretations.map((a) => [a.status, a.data.comment, a.data.action]), [["proposed", first.id, "address"], ["proposed", second.id, "reply"]]);
  assert.equal(store.listLinks(session.id).filter((link) => link.kind === "about").length, 2);
  for (const [i, target] of [first, second].entries()) assert.ok(store.listLinks(session.id).some((link) => link.from === interpretations[i]!.id && link.to === target.id && link.kind === "about"));
  assert.equal(prompts[0]!.tools, "read-only");
  for (const text of ["PHID-XCMT-1", "dom/a.cpp:12", "const int kMax = 20;", "Please name the constant.", "Why not X?"]) assert.ok(prompts[0]!.prompt.includes(text), text);
});

test("memories for the reviewerComments phase are in the prompt and recorded", async () => {
  const knowledge = new KnowledgeStore(":memory:");
  const { store, session, prompts, rt } = setup(response(), knowledge);
  knowledge.put(session.repoDir, "implement", "memory/rename-everywhere", { situation: "a reviewer asks for a rename", observed: "o", wanted: "rename it everywhere", why: null, phases: ["reviewerComments"], kinds: [], source: { sessionId: "S", epoch: 1, steer: "ST" } }, { by: "user", sessionId: "S" });
  await rt.run(session.id, "interpretComments", { comments: ["PHID-XCMT-1", "PHID-XCMT-2"] });
  assert.ok(prompts[0]!.prompt.startsWith("# How this user wants things done\n\n- When a reviewer asks for a rename: rename it everywhere\n\n# Reviewer comments"));
  assert.equal(store.listArtifacts(session.id, "UsedMemories").length, 1);
});

test("interpretComments rejects missing and invented comment phids", async () => {
  const missing = setup(response(["PHID-XCMT-1"]));
  await assert.rejects(missing.rt.run(missing.session.id, "interpretComments", { comments: ["PHID-XCMT-1", "PHID-XCMT-2"] }), /did not interpret PHID-XCMT-2/);
  const unknown = setup({ comments: [...response().comments, { phid: "PHID-XCMT-9", asks: "?", proposal: "None", action: "ignore", reply: null }] });
  await assert.rejects(unknown.rt.run(unknown.session.id, "interpretComments", { comments: ["PHID-XCMT-1", "PHID-XCMT-2"] }), /unknown comment PHID-XCMT-9/);
  assert.equal(unknown.store.listArtifacts(unknown.session.id).filter((a) => a.type === "CommentInterpretation").length, 0);
});
