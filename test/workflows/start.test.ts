// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability } from "../../src/runtime/tasks.ts";
import type { Workflow } from "../../src/runtime/plugins.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { LlmSelection, Session, StartQuestion, WorkflowStartData } from "../../src/shared/types.ts";
import { corePlugin } from "../../src/runtime/create.ts";
import { chatPlugin } from "../../src/plugins/chat/index.ts";
import { startSession, type PendingStart, type StartRequest } from "../../src/workflows/start.ts";
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
/** Selector replies, consumed in order; the last one repeats. */
let replies: unknown[] = [];
const prompts: string[] = [];
const llm: LlmService = {
  defaultSelection: selection,
  async run(chosen, prompt) { prompts.push(prompt.prompt); return { text: "", json: replies.length > 1 ? replies.shift() : replies[0], providerSessionId: "p", selection: chosen ?? selection }; },
  async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
};
const repo = makeRepo();
repo.commit({ "a.txt": "1\n" }, "base");
const store = new Store(":memory:");
const rt = new Runtime({ store, plugins: [corePlugin, chatPlugin, { id: "t", workflows: [gated] }], llm, git: () => ({}) as GitCapability });
async function waitFor<T>(fn: () => T | undefined, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = fn(); if (value !== undefined) return value; await new Promise((resolve) => setTimeout(resolve, 20)); }
  throw new Error("timeout");
}

const pending = new Map<string, PendingStart>();
const start = (request: StartRequest) => startSession(rt, pending, request, new AbortController().signal);
const choose = { question: null, workflow: "gated", title: "T", params: { mode: null } };

test("a precheck question comes back without creating a session; an invalid answer keeps it open", async () => {
  const before = store.listSessions().length;
  const result = await start({ path: repo.dir, text: "/gated do it" }) as StartQuestion;
  assert.deepEqual(result, { id: result.id, question: "Which mode?", options: [{ label: "Mode A" }, { label: "Cancel", cancel: true }] });
  assert.equal(store.listSessions().length, before);
  await assert.rejects(start({ question: result.id, answer: 7 }), /Invalid answer/);
  await assert.rejects(start({ question: result.id, answer: "Mode A" }), /Invalid answer/);
  assert.ok(pending.has(result.id));
});

test("an answer completes the params and creates the session with its workflow; llm and write mode are stored on the start", async () => {
  started.length = 0;
  const question = await start({ path: repo.dir, text: "/gated do it", llm: selection, writeMode: "editsOnly" }) as StartQuestion;
  const session = await start({ question: question.id, answer: 0 }) as Session;
  assert.equal(session.workflow, "gated");
  assert.equal(session.title, "/gated do it");
  const data = store.listArtifacts(session.id, "WorkflowStart")[0]!.data as WorkflowStartData;
  assert.deepEqual(data.params, { mode: "a" });
  assert.deepEqual(data.llm, selection);
  assert.equal(data.writeMode, "editsOnly");
  await waitFor(() => started.length ? true : undefined);
  assert.deepEqual(started, [{ mode: "a" }]);
  await assert.rejects(start({ question: question.id, answer: 0 }), /no longer open/);
});

test("cancelling the question starts nothing", async () => {
  const before = store.listSessions().length;
  const question = await start({ path: repo.dir, text: "/gated do it" }) as StartQuestion;
  await assert.rejects(start({ question: question.id, answer: 1 }), /cancelled/);
  assert.equal(store.listSessions().length, before);
});

test("a command without a precheck question starts at once", async () => {
  const session = await start({ path: repo.dir, text: "/chat hello" }) as Session;
  assert.equal(store.listArtifacts(session.id, "WorkflowStart").length, 1);
});

test("the selector's choice gets the precheck question as options; the answer starts it without asking the selector again", async () => {
  started.length = 0;
  replies = [choose];
  prompts.length = 0;
  const before = store.listSessions().length;
  const question = await start({ path: repo.dir, text: "do the thing", writeMode: "full" }) as StartQuestion;
  assert.equal(question.question, "Which mode?");
  assert.deepEqual(question.options, [{ label: "Mode A" }, { label: "Cancel", cancel: true }]);
  assert.equal(store.listSessions().length, before);
  const session = await start({ question: question.id, answer: 0 }) as Session;
  assert.equal(prompts.length, 1);
  assert.equal(session.title, "T");
  const startArtifact = store.listArtifacts(session.id, "WorkflowStart")[0]!;
  assert.deepEqual(startArtifact.data, { via: "selector", workflow: "gated", params: { mode: "a" }, title: "T", prompt: "do the thing", writeMode: "full" });
  assert.deepEqual(startArtifact.provenance.llm, selection);
});

test("the selector's question is answered in text and selection continues with the answer", async () => {
  replies = [{ ...choose, question: "Which thing?" }, { ...choose, params: { mode: "b" } }];
  prompts.length = 0;
  const before = store.listSessions().length;
  const question = await start({ path: repo.dir, text: "do it" }) as StartQuestion;
  assert.deepEqual(question, { id: question.id, question: "Which thing?" });
  assert.equal(store.listSessions().length, before);
  await assert.rejects(start({ question: question.id, answer: "  " }), /must not be empty/);
  const session = await start({ question: question.id, answer: "the blue one" }) as Session;
  assert.match(prompts.at(-1)!, /# Clarification\n\nQuestion: Which thing\?\nAnswer: the blue one/);
  assert.equal((store.listArtifacts(session.id, "WorkflowStart")[0]!.data as WorkflowStartData).prompt, "do it\n\n# Clarification\n\nQuestion: Which thing?\nAnswer: the blue one");
});
