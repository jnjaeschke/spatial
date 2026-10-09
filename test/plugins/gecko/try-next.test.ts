import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, DecisionData, Epoch, WorkflowView } from "../../../src/plugin-api.ts";
import { pushQuestion, tryNext } from "../../../src/plugins/gecko/workflow/try.ts";

let n = 0;
const art = (type: string, data: unknown, epoch: number): Artifact => ({ id: `${type}${++n}`, sessionId: "s", type, status: "verified", data, provenance: { taskId: "t" }, epoch, createdAt: "" });
const epoch = (num: number, phase: string, input: unknown = null): Epoch => ({ sessionId: "s", n: num, phase, status: "succeeded", input, error: null, startedAt: "", endedAt: "" });
const tryEpoch = epoch(4, "try", { base: "BASE", head: "HEAD1" });
const proposal = art("TryProposal", { command: "./mach try auto", reason: "r" }, 4);
const view = (artifacts: Artifact[], epochs: Epoch[] = [tryEpoch]): WorkflowView => ({ artifacts, links: [], epochs });
const PUSH_QUESTION = pushQuestion("HEAD1");
const answer = (chosen: DecisionData["chosen"]) => art("Decision", { question: PUSH_QUESTION, options: [], chosen } satisfies DecisionData, 4);

test("the proposal asks Push with the command prefilled, or Skip", () => {
  const step = tryNext(view([proposal]), tryEpoch);
  assert.ok(step && "decide" in step);
  assert.equal(step.decide.question, "Push HEAD1 to try?");
  assert.equal(step.chosen, undefined);
  assert.deepEqual(step.decide.options.map((o) => o.id), ["push", "skip"]);
  assert.equal(step.decide.options[0]!.defaultText, "./mach try auto");
  assert.equal(step.decide.options[0]!.requiresText, true);
  assert.ok(step.decide.options[0]!.textPattern);
});

test("Push runs tryPush with the edited command and the accepted tip; once pushed or skipped the phase is done", () => {
  const push = answer({ option: "push", by: "user", text: " ./mach try fuzzy --query 'x' " });
  assert.deepEqual(tryNext(view([proposal, push]), tryEpoch), { run: "tryPush", input: { command: "./mach try fuzzy --query 'x'", head: "HEAD1", proposalId: proposal.id } });
  assert.equal(tryNext(view([proposal, push], [tryEpoch, epoch(5, "tryPush")]), tryEpoch), null);
  assert.equal(tryNext(view([proposal, answer({ option: "skip", by: "user" })]), tryEpoch), null);
});

test("answers and proposals of other try epochs do not count", () => {
  const old = art("TryProposal", { command: "./mach try again", reason: "r" }, 2);
  assert.equal(tryNext(view([old]), tryEpoch), null);
  const oldAnswer = art("Decision", { question: PUSH_QUESTION, options: [], chosen: { option: "skip", by: "user" } } satisfies DecisionData, 2);
  const step = tryNext(view([proposal, oldAnswer]), tryEpoch);
  assert.ok(step && "decide" in step);
});
