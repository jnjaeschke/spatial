import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact } from "../../../src/shared/types.ts";
import { steerOutcome, steerPlan, steerSections, steersOf } from "../../../src/plugins/implement/runtime/steers.ts";

const art = (id: string, type: string, data: unknown, epoch: number | null = 1) => ({ id, sessionId: "s", type, status: "verified", data, provenance: { taskId: "t" }, epoch, createdAt: "" }) as Artifact;
const steer = (id: string, text: string, epoch = 1) => art(id, "Steer", { text, epoch, phase: "implement" }, epoch);
const session = (id: string, providerSessionId: string, resumed = false, epoch = 1) => art(id, "AgentSession", { providerSessionId, backend: "claude", model: "sonnet", resumed }, epoch);

test("steersOf lists the steers of one epoch in order", () => {
  const artifacts = [steer("a", "one"), steer("b", "other epoch", 2), steer("c", "two")];
  assert.deepEqual(steersOf(artifacts, 1).map((a) => a.id), ["a", "c"]);
  assert.deepEqual(steersOf(artifacts, null), []);
});

test("a run resumes the stopped session with the steers it has not seen, and starts fresh when there is none", () => {
  assert.deepEqual(steerPlan([], 1), { all: [], resume: null });
  assert.deepEqual(steerPlan([steer("a", "one")], 1), { all: ["one"], resume: null });
  assert.deepEqual(steerPlan([session("s1", "p1"), steer("a", "one")], 1), { all: ["one"], resume: { providerSessionId: "p1", steers: ["one"] } });
  assert.deepEqual(steerPlan([session("s1", "p1"), steer("a", "one"), steer("b", "two")], 1).resume, { providerSessionId: "p1", steers: ["one", "two"] });
  assert.deepEqual(steerPlan([steer("a", "one"), session("s1", "p1")], 1), { all: ["one"], resume: null });
  assert.deepEqual(steerPlan([session("s1", "p1"), steer("a", "one"), session("s2", "p2", true), steer("b", "two")], 1).resume, { providerSessionId: "p2", steers: ["two"] });
  assert.deepEqual(steerPlan([session("s1", "p1", false, 2), steer("a", "one")], 1).resume, null);
  assert.deepEqual(steerPlan([steer("a", "one")], null), { all: [], resume: null });
});

test("the steer sections tell the agent it was stopped and, when it can edit, that its edits may remain", () => {
  assert.deepEqual(steerSections([], true), []);
  assert.deepEqual(steerSections(["use a helper"], true), ["# The user stopped you and said", "use a helper\n\nThe work tree may hold edits from the stopped run."]);
  assert.equal(steerSections(["a", "b"], true)[1], "1. a\n\n2. b\n\nThe work tree may hold edits from the stopped run.");
  assert.deepEqual(steerSections(["look at b.txt"], false), ["# The user stopped you and said", "look at b.txt"]);
});

test("the outcome of a steer is read from the first agent session after the newest steer", () => {
  assert.equal(steerOutcome([session("s1", "p1")], 1), null);
  assert.equal(steerOutcome([session("s1", "p1"), steer("a", "one")], 1), null);
  assert.equal(steerOutcome([session("s1", "p1"), steer("a", "one"), session("s2", "p2", true), session("s3", "p3", true)], 1), "resumed");
  assert.equal(steerOutcome([session("s1", "p1"), steer("a", "one"), session("s2", "p2", false), session("s3", "p3", true)], 1), "restarted");
});
