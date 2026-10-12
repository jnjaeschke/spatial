import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, DecisionData, Epoch, SessionState } from "../../src/shared/types.ts";
import { decisionLabel, epochChips, showEpochStrip, stateAtEpoch } from "../../src/web/epochs.ts";

const epoch = (n: number, phase: string, status: Epoch["status"] = "succeeded"): Epoch => ({ sessionId: "s", n, phase, status, input: null, error: null, startedAt: "", endedAt: "" });
let k = 0;
const art = (type: string, data: unknown, at: number | null): Artifact => ({ id: `a${++k}`, sessionId: "s", type, status: "verified", data, provenance: { taskId: "t" }, epoch: at, createdAt: "" });
const decision = (chosen: DecisionData["chosen"], at: number) => art("Decision", { key: "q", question: "Q", options: [{ id: "fix", label: "Fix" }, { id: "accept", label: "Accept" }], chosen } satisfies DecisionData, at);
const state = (artifacts: Artifact[], epochs: Epoch[]): SessionState => ({ session: { id: "s", worktree: "/r", repoDir: "/r/.git", title: "t", createdAt: "", workflow: "w" }, artifacts, links: [], tasks: [], epochs, lastEventId: 0, searchfox: null });

test("decision labels say who decided", () => {
  assert.equal(decisionLabel({ key: "q", question: "Q", options: [{ id: "fix", label: "Fix" }], chosen: null }), "?");
  assert.equal(decisionLabel({ key: "q", question: "Q", options: [{ id: "fix", label: "Fix" }], chosen: { option: "fix", by: "rule" } }), "Fix (rule)");
  assert.equal(decisionLabel({ key: "q", question: "Q", options: [], chosen: { option: "x", by: "user" } }), "x (you)");
});

test("each epoch shows the latest decision that followed it", () => {
  const chips = epochChips(state([decision(null, 1), decision({ option: "fix", by: "rule" }, 1), decision({ option: "accept", by: "user" }, 2)], [epoch(1, "investigate"), epoch(2, "review"), epoch(3, "x", "failed")]));
  assert.deepEqual(chips, [
    { n: 1, phase: "investigate", status: "succeeded", decision: "Fix (rule)" },
    { n: 2, phase: "review", status: "succeeded", decision: "Accept (you)" },
    { n: 3, phase: "x", status: "failed", decision: null },
  ]);
});

test("the state at an epoch leaves out later epochs and what they created", () => {
  const early = art("Diff", {}, 1), late = art("Diff", {}, 2), before = art("WorkflowStart", {}, null);
  const s = state([before, early, late], [epoch(1, "review"), epoch(2, "review")]);
  const at1 = stateAtEpoch({ ...s, links: [{ id: "l1", sessionId: "s", from: early.id, to: before.id, kind: "about" }, { id: "l2", sessionId: "s", from: late.id, to: early.id, kind: "about" }], tasks: [{ id: "t1", sessionId: "s", kind: "k", status: "succeeded", input: null, output: null, error: null, epoch: 2, parentId: null, createdAt: "", updatedAt: "" }] }, 1);
  assert.deepEqual(at1.artifacts.map((a) => a.id), [before.id, early.id]);
  assert.deepEqual(at1.epochs.map((e) => e.n), [1]);
  assert.deepEqual(at1.links.map((l) => l.id), ["l1"]);
  assert.deepEqual(at1.tasks, []);
});

test("the strip shows once a decision exists", () => {
  assert.equal(showEpochStrip(state([], [epoch(1, "review")])), false);
  assert.equal(showEpochStrip(state([decision(null, 1)], [epoch(1, "review")])), true);
});
