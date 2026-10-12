import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type Phase, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { Step, Workflow } from "../../src/runtime/plugins.ts";
import { renderRef, type WorkflowView } from "../../src/runtime/render-ref.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import type { Artifact, DecisionData, WorkflowStartData } from "../../src/shared/types.ts";
import { runWorkflow } from "../../src/workflows/start.ts";

const llm: LlmService = {
  defaultSelection: { backend: "claude", model: "m", effort: "low" },
  async run() { throw new Error("unused"); },
  async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
};
const OPTIONS = [{ id: "go", label: "Go" }, { id: "stop", label: "Stop" }];

function setup(next?: (view: WorkflowView) => Step | null, follow?: Phase<unknown>["next"]) {
  const store = new Store(":memory:");
  const calls: string[] = [];
  const phase = (id: string): Phase<unknown> => ({ id, async run() { calls.push(id); if (id === "boom") throw new Error("kaput"); }, ...((id === "a" || id === "boom") && follow ? { next: follow } : {}) });
  const flow: Workflow<Record<string, never>> = { id: "flow", description: "d", argHint: "", params: z.strictObject({}), parseArgs: () => ({ ok: true, params: {} }), async start() {}, ...(next ? { next } : {}) };
  const rt = new Runtime({ store, plugins: [{ id: "t", workflows: [flow], phases: [phase("a"), phase("b"), phase("boom")] }], llm, git: () => ({}) as GitCapability, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t", workflow: "flow" });
  return { store, rt, session, calls };
}
const decisionsOf = (store: Store, id: string) => store.listArtifacts(id, "Decision") as Artifact<DecisionData>[];
const chosenOf = (view: WorkflowView) => (view.artifacts.findLast((a) => a.type === "Decision") as Artifact<DecisionData> | undefined)?.data.chosen;

test("advance runs steps until next returns null", async () => {
  const { store, rt, session, calls } = setup((view) => view.epochs.length === 0 ? { run: "a", input: null } : view.epochs.length === 1 ? { run: "b", input: null } : null);
  await rt.advance(session.id);
  assert.deepEqual(calls, ["a", "b"]);
  assert.deepEqual(store.listEpochs(session.id).map((e) => [e.phase, e.status]), [["a", "succeeded"], ["b", "succeeded"]]);
});

test("a rule decision is stored already chosen and the loop continues", async () => {
  const { store, rt, session, calls } = setup((view) => {
    const last = view.epochs.at(-1);
    if (!last) return { run: "a", input: null };
    if (last.phase === "a") return chosenOf(view) ? { run: "b", input: null } : { decide: { key: "go", question: "Go?", options: OPTIONS }, chosen: { option: "go", reason: "because" } };
    return null;
  });
  await rt.advance(session.id);
  assert.deepEqual(calls, ["a", "b"]);
  const [decision] = decisionsOf(store, session.id);
  assert.equal(decisionsOf(store, session.id).length, 1);
  assert.equal(decision!.status, "verified");
  assert.equal(decision!.epoch, 1);
  assert.deepEqual(decision!.data.chosen, { option: "go", by: "rule", reason: "because" });
});

test("advance stores an open decision once and waits", async () => {
  const { store, rt, session, calls } = setup((view) => view.epochs.length === 0 ? { run: "a", input: null } : { decide: { key: "go", question: "Go?", options: OPTIONS } });
  await rt.advance(session.id);
  await rt.advance(session.id);
  assert.deepEqual(calls, ["a"]);
  const decisions = decisionsOf(store, session.id);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0]!.data.chosen, null);
  assert.equal(decisions[0]!.status, "proposed");
});

test("advance continues after the decision is answered", async () => {
  const { store, rt, session, calls } = setup((view) => {
    if (view.epochs.length === 0) return { run: "a", input: null };
    if (view.epochs.length === 1) return chosenOf(view) ? { run: "b", input: null } : { decide: { key: "go", question: "Go?", options: OPTIONS } };
    return null;
  });
  await rt.advance(session.id);
  const [open] = decisionsOf(store, session.id);
  store.putArtifact({ sessionId: session.id, type: "Decision", status: "verified", data: { ...open!.data, chosen: { option: "go", by: "user" } }, provenance: { taskId: "user" } });
  await rt.advance(session.id);
  assert.deepEqual(calls, ["a", "b"]);
});

test("advance throws when next asks an answered decision again", async () => {
  const { store, rt, session } = setup((view) => view.epochs.length === 0 ? { run: "a", input: null } : { decide: { key: "go", question: "Go?", options: OPTIONS } });
  await rt.advance(session.id);
  const [open] = decisionsOf(store, session.id);
  store.putArtifact({ sessionId: session.id, type: "Decision", status: "verified", data: { ...open!.data, chosen: { option: "go", by: "user" } }, provenance: { taskId: "user" } });
  await assert.rejects(rt.advance(session.id), /asked decision "go" again/);
});

test("a rule decision must choose one of its options", async () => {
  const { rt, session } = setup(() => ({ decide: { key: "go", question: "Go?", options: OPTIONS }, chosen: { option: "nope", reason: "x" } }));
  await assert.rejects(rt.advance(session.id), /unknown option nope/);
});

test("a failing phase rejects and next is not asked again", async () => {
  let asked = 0;
  const { store, rt, session, calls } = setup(() => { asked++; return { run: "boom", input: null }; });
  await assert.rejects(rt.advance(session.id), /kaput/);
  assert.equal(asked, 1);
  assert.deepEqual(calls, ["boom"]);
  assert.equal(store.listEpochs(session.id)[0]!.status, "failed");
});

test("advance does nothing for a workflow without next", async () => {
  const { store, rt, session } = setup();
  await rt.advance(session.id);
  assert.equal(store.listEpochs(session.id).length, 0);
});

test("runWorkflow advances a workflow that has next", async () => {
  const { store, rt, session } = setup((view) => view.epochs.length === 0 ? { run: "a", input: null } : null);
  const start = store.putArtifact<WorkflowStartData>({ sessionId: session.id, type: "WorkflowStart", status: "verified", provenance: { taskId: "user" }, data: { via: "command", workflow: "flow", params: {}, title: "t", prompt: "" } });
  await runWorkflow(rt, session.id, start.id);
  assert.equal(store.listEpochs(session.id).length, 1);
});

test("a Decision renders its question and answer", async () => {
  const { store, rt, session } = setup((view) => chosenOf(view) ? null : { decide: { key: "go", question: "Go?", options: OPTIONS }, chosen: { option: "go", reason: "r" } });
  await rt.advance(session.id);
  const [decision] = decisionsOf(store, session.id);
  const text = renderRef(rt.plugins.artifactKinds, { artifacts: store.listArtifacts(session.id), links: [] }, decision!.id);
  assert.match(text, /Go\?/);
  assert.match(text, /Chosen: Go \(rule\)/);
});

test("the latest epoch's phase follows up before the workflow's next, also in a session whose workflow has no next", async () => {
  const { store, rt, session, calls } = setup(undefined, (view, epoch) => view.epochs.some((e) => e.phase === "b") ? null : chosenOf(view) ? { run: "b", input: { after: epoch.n } } : { decide: { key: "follow", question: "Follow?", options: OPTIONS } });
  await rt.runPhase(session.id, "a", null);
  await rt.advance(session.id);
  assert.equal(decisionsOf(store, session.id).at(-1)!.data.key, "follow");
  assert.deepEqual(calls, ["a"]);
  const open = decisionsOf(store, session.id).at(-1)!;
  store.putArtifact<DecisionData>({ sessionId: session.id, type: "Decision", status: "verified", data: { ...open.data, chosen: { option: "go", by: "user" } }, provenance: { taskId: "user" } });
  await rt.advance(session.id);
  assert.deepEqual(calls, ["a", "b"]);
  assert.deepEqual(store.listEpochs(session.id).at(-1)!.input, { after: 1 });
});

test("a failed epoch gets no follow-up, and the workflow decides once the phase is done", async () => {
  const follow = () => ({ decide: { key: "follow", question: "Follow?", options: OPTIONS } });
  const failed = setup(undefined, follow);
  await assert.rejects(failed.rt.runPhase(failed.session.id, "boom", null), /kaput/);
  assert.equal(failed.rt.nextStep(failed.session.id), null);
  const done = setup((view) => view.epochs.length === 1 ? { run: "b", input: null } : null, () => null);
  await done.rt.runPhase(done.session.id, "a", null);
  await done.rt.advance(done.session.id);
  assert.deepEqual(done.calls, ["a", "b"]);
  assert.equal(done.rt.nextStep(done.session.id), null);
});

test("a decision step for an earlier epoch is stored at that epoch and asked again after another decision", async () => {
  const { store, rt, session } = setup((view) => view.epochs.length === 2 ? { decide: { key: "go", question: "Go?", options: OPTIONS }, epoch: 1 } : null);
  await rt.runPhase(session.id, "a", null);
  await rt.runPhase(session.id, "b", null);
  await rt.advance(session.id);
  assert.equal(decisionsOf(store, session.id).at(-1)!.epoch, 1);
  await rt.advance(session.id);
  assert.equal(decisionsOf(store, session.id).length, 1);
  store.putArtifact<DecisionData>({ sessionId: session.id, type: "Decision", status: "proposed", data: { key: "other", question: "Other?", options: OPTIONS, chosen: null }, provenance: { taskId: "t" } });
  await rt.advance(session.id);
  assert.deepEqual(decisionsOf(store, session.id).map((d) => [d.data.key, d.epoch]), [["go", 1], ["other", 2], ["go", 1]]);
});

test("a decision is identified by key and epoch, not by its question text", async () => {
  let question = "Go?";
  const { store, rt, session } = setup((view) => view.epochs.length === 0 ? { run: "a", input: null } : { decide: { key: "go", question, options: OPTIONS } });
  await rt.advance(session.id);
  question = "Go now?";
  await rt.advance(session.id);
  assert.equal(decisionsOf(store, session.id).length, 1, "the reworded question is the same open decision");
  const [open] = decisionsOf(store, session.id);
  store.putArtifact<DecisionData>({ sessionId: session.id, type: "Decision", status: "verified", data: { ...open!.data, chosen: { option: "go", by: "user" } }, provenance: { taskId: "user" } });
  await assert.rejects(rt.advance(session.id), /asked decision "go" again/);
});

test("two keys in one epoch are two decisions even with the same question text", async () => {
  let key = "first";
  const { store, rt, session } = setup((view) => view.epochs.length === 0 ? { run: "a", input: null } : { decide: { key, question: "Go?", options: OPTIONS } });
  await rt.advance(session.id);
  key = "second";
  await rt.advance(session.id);
  assert.deepEqual(decisionsOf(store, session.id).map((d) => d.data.key), ["first", "second"]);
});
