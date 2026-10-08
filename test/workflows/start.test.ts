// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { Workflow } from "../../src/runtime/plugins.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { LlmSelection, SelectorQuestionData, Session, StartQuestion, WorkflowStartData } from "../../src/shared/types.ts";
import { corePlugin } from "../../src/runtime/create.ts";
import { chatPlugin } from "../../src/plugins/chat/index.ts";
import { startSession } from "../../src/workflows/start.ts";
import { makeRepo } from "../helpers/git-fixture.ts";

const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
type Params = { mode: "a" | "b" | null };
const started: Params[] = [];
const gated: Workflow<Params> = {
  id: "gated", description: "Test workflow", argHint: "<x>", params: z.strictObject({ mode: z.enum(["a", "b"]).nullable() }),
  parseArgs: (args) => args.trim() ? { ok: true, params: { mode: null } } : { ok: false, error: "Usage: /gated <x>" },
  async precheck(_repo, params) { return params.mode === null ? { question: "Which mode?", options: [{ label: "Mode A", params: { mode: "a" } }, { label: "Cancel" }] } : null; },
  async start(_rt, _id, input) { started.push(input.params); },
};
const llm: LlmService = {
  defaultSelection: selection,
  async run(chosen) { return { text: "", json: { question: null, workflow: "gated", title: "T", params: { mode: null } }, providerSessionId: "p", selection: chosen ?? selection }; },
  async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
};
const repo = makeRepo();
repo.commit({ "a.txt": "1\n" }, "base");
const store = new Store(":memory:");
const rt = new Runtime({ store, plugins: [corePlugin, chatPlugin, { id: "t", workflows: [gated] }], llm, git: () => ({}) as GitCapability, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
async function waitFor<T>(fn: () => T | undefined, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = fn(); if (value !== undefined) return value; await new Promise((resolve) => setTimeout(resolve, 20)); }
  throw new Error("timeout");
}

test("precheck question comes back without creating a session", async () => {
  const before = store.listSessions().length;
  const result = await startSession(rt, repo.dir, "/gated do it") as StartQuestion;
  assert.deepEqual(result, { question: "Which mode?", options: [{ label: "Mode A" }, { label: "Cancel", cancel: true }] });
  assert.equal(store.listSessions().length, before);
  const outOfRange = await startSession(rt, repo.dir, "/gated do it", undefined, { answer: 7 });
  assert.ok("question" in outOfRange);
});

test("an answer completes the params; llm and write mode are stored on the start", async () => {
  started.length = 0;
  const session = await startSession(rt, repo.dir, "/gated do it", selection, { answer: 0, writeMode: "editsOnly" }) as Session;
  const start = store.listArtifacts(session.id, "WorkflowStart")[0]!;
  assert.deepEqual((start.data as WorkflowStartData).params, { mode: "a" });
  assert.deepEqual((start.data as WorkflowStartData).llm, selection);
  assert.equal((start.data as WorkflowStartData).writeMode, "editsOnly");
  await waitFor(() => started.length ? true : undefined);
  assert.deepEqual(started, [{ mode: "a" }]);
});

test("cancelling the question starts nothing", async () => {
  const before = store.listSessions().length;
  await assert.rejects(startSession(rt, repo.dir, "/gated do it", undefined, { answer: 1 }), /cancelled/);
  assert.equal(store.listSessions().length, before);
});

test("a command without a precheck question starts at once", async () => {
  const session = await startSession(rt, repo.dir, "/chat hello") as Session;
  assert.equal(store.listArtifacts(session.id, "WorkflowStart").length, 1);
});

test("selector path stores the precheck question as a SelectorQuestion", async () => {
  started.length = 0;
  const session = await startSession(rt, repo.dir, "do the thing", undefined, { writeMode: "full" }) as Session;
  const question = await waitFor(() => store.listArtifacts(session.id, "SelectorQuestion")[0]);
  const data = question.data as SelectorQuestionData;
  assert.match(data.question, /Which mode\?/);
  assert.match(data.question, /"Mode A"/);
  assert.doesNotMatch(data.question, /Cancel/);
  assert.equal(data.round, 1);
  assert.equal(data.writeMode, "full");
  assert.equal(store.getSession(session.id).workflow, null);
  assert.deepEqual(started, []);
});
