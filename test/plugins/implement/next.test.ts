import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, DecisionData, DecisionOption, Epoch, EpochStatus, LlmSelection, RepoProfile, Step, WorkflowView } from "../../../src/plugin-api.ts";
import { implementCheckAnswer, implementNext, workInQuestion } from "../../../src/plugins/implement/workflow/next.ts";
import type { CommentPlanItem } from "../../../src/plugins/implement/shared/comment-plan.ts";

let n = 0;
const art = (type: string, data: unknown, epoch: number | null): Artifact => ({ id: `${type}${++n}`, sessionId: "s", type, status: "verified", data, provenance: { taskId: "t" }, epoch, createdAt: "" });
const epoch = (num: number, phase: string, status: EpochStatus = "succeeded"): Epoch => ({ sessionId: "s", n: num, phase, status, input: null, error: null, startedAt: "", endedAt: "" });
const sel = (model: string): LlmSelection => ({ backend: "claude", model, effort: "low" });
const START = sel("start"), IMPL = sel("impl");
const plain: RepoProfile = { id: "plain", description: "p", commitStyle: "single" };
const stack: RepoProfile = { id: "stack", description: "s", commitStyle: "stack", requiresBug: true, afterAccept: ["x", "y"] };
const never: RepoProfile = { id: "never", description: "n", commitStyle: "single", autoFixRounds: 0 };
const profiles = new Map([plain, stack, never].map((p) => [p.id, p]));

const start = () => art("WorkflowStart", { via: "command", workflow: "implement", params: { request: "fix it", profile: null, checkout: null }, title: "t", prompt: "fix it", llm: START, writeMode: "editsOnly" }, null);
const branch = (profile = "plain") => art("ImplementBranch", { branch: "spatial/x", baseSha: "BASE", baseRef: "main", profile, checkout: "new-branch" }, null);
const investigation = (bug: number | null, epochN = 1) => art("Investigation", { kind: "bugfix", summary: "S", bug, locations: [], testCases: [], steps: [], openQuestions: [], exploration: [] }, epochN);
const result = (epochN: number, over: object = {}) => art("ImplementResult", { head: "HEAD1", branch: "spatial/x", summary: "s", planChange: null, planInvalid: null, ...over }, epochN);
const decision = (question: string, chosen: DecisionData["chosen"], epochN: number, options: DecisionOption[] = []) => art("Decision", { question, options, chosen } satisfies DecisionData, epochN);
const finding = (epochN: number) => art("ReviewFinding", { anchor: "a", severity: "high", title: "T", body: "B" }, epochN);
const view = (artifacts: Artifact[], epochs: Epoch[], links: WorkflowView["links"] = []): WorkflowView => ({ artifacts, links, epochs });
const next = (v: WorkflowView) => implementNext(v, { repoProfiles: profiles });
const decide = (step: Step | null) => (step && "decide" in step ? step : assert.fail(`not a decision: ${JSON.stringify(step)}`));
const run = (step: Step | null) => (step && "run" in step ? step : assert.fail(`not a run: ${JSON.stringify(step)}`));
const APPROVE = "Approve the investigation plan?", REVIEWED = "The self-review is done. What next?";

test("without epochs the investigation starts with the start box selection", () => {
  const step = run(next(view([start(), branch()], [])));
  assert.equal(step.run, "investigate");
  assert.deepEqual(step.input, { request: "fix it", profile: "plain", baseSha: "BASE", branch: "spatial/x", llm: START });
});

test("a failed or running epoch waits for Retry", () => {
  assert.equal(next(view([start(), branch()], [epoch(1, "investigate", "failed")])), null);
  assert.equal(next(view([start(), branch()], [epoch(1, "investigate", "running")])), null);
});

test("nothing happens before the branch exists", () => assert.equal(next(view([start()], [])), null));

test("after the investigation the user approves, revises or cancels", () => {
  const inv = investigation(null);
  const step = decide(next(view([start(), branch(), inv], [epoch(1, "investigate")])));
  assert.equal(step.decide.question, APPROVE);
  assert.deepEqual(step.decide.options.map((o) => o.id), ["approve", "revise", "cancel"]);
  assert.equal(step.decide.options[0]!.takesModel, true);
  assert.equal(step.decide.options[0]!.takesText, undefined);
  assert.equal(step.chosen, undefined);
});

test("profile that requires a bug asks for the number", () => {
  const withoutBug = decide(next(view([start(), branch("stack"), investigation(null)], [epoch(1, "investigate")])));
  assert.deepEqual(withoutBug.decide.options[0], { id: "approve", label: "Approve", takesModel: true, takesText: true, requiresText: true, textPattern: "\\d+" });
  const withBug = decide(next(view([start(), branch("stack"), investigation(77)], [epoch(1, "investigate")])));
  assert.equal(withBug.decide.options[0]!.requiresText, undefined);
});

test("approval starts implement with the chosen model, the bug from the text and the start's write mode", () => {
  const v = (text?: string) => view([start(), branch("stack"), investigation(null), decision(APPROVE, { option: "approve", by: "user", ...(text ? { text } : {}), llm: IMPL }, 1)], [epoch(1, "investigate")]);
  const step = run(next(v("bug 4711 please")));
  assert.equal(step.run, "implement");
  const { branchId, investigationId, ...rest } = step.input as { branchId: string; investigationId: string };
  assert.ok(branchId && investigationId);
  assert.deepEqual(rest, { bug: 4711, text: null, writeMode: "editsOnly", llm: IMPL });
  const withKnownBug = run(next(view([start(), branch("stack"), investigation(77), decision(APPROVE, { option: "approve", by: "user" }, 1)], [epoch(1, "investigate")])));
  assert.equal((withKnownBug.input as { bug: number; llm: LlmSelection }).bug, 77);
  assert.deepEqual((withKnownBug.input as { llm: LlmSelection }).llm, START, "no chosen model falls back to the start selection");
});

test("revise reinvestigates with the previous investigation and the text; cancel stops", () => {
  const inv = investigation(null);
  const revise = run(next(view([start(), branch(), inv, decision(APPROVE, { option: "revise", by: "user", text: "look at X" }, 1)], [epoch(1, "investigate")])));
  assert.equal(revise.run, "investigate");
  assert.deepEqual((revise.input as { previous: unknown }).previous, { id: inv.id, text: "look at X" });
  assert.equal(next(view([start(), branch(), inv, decision(APPROVE, { option: "cancel", by: "user" }, 1)], [epoch(1, "investigate")])), null);
});

test("a replacement investigate phase is honoured through the profile", () => {
  const custom: RepoProfile = { id: "custom", description: "c", commitStyle: "single", investigatePhase: "my-investigate" };
  const v = view([start(), branch("custom")], []);
  assert.equal(run(implementNext(v, { repoProfiles: new Map([["custom", custom]]) })).run, "my-investigate");
});

const baseArtifacts = (profile = "plain", bug: number | null = null) => {
  const inv = investigation(bug);
  return [start(), branch(profile), inv, decision(APPROVE, { option: "approve", by: "user", llm: IMPL, ...(profile === "stack" ? { text: "5" } : {}) }, 1)];
};

test("after implement the review runs on the recorded tip, as an update from the second round", () => {
  const first = run(next(view([...baseArtifacts(), result(2)], [epoch(1, "investigate"), epoch(2, "implement")])));
  assert.deepEqual(first, { run: "review", input: { base: "BASE", head: "HEAD1", update: false, llm: START } });
  const later = run(next(view([...baseArtifacts(), result(2), result(4)], [epoch(1, "investigate"), epoch(2, "implement"), epoch(3, "review"), epoch(4, "implement")])));
  assert.equal((later.input as { update: boolean }).update, true);
});

const afterReview = (extra: Artifact[], profile = "plain") => view([...baseArtifacts(profile), result(2), ...extra], [epoch(1, "investigate"), epoch(2, "implement"), epoch(3, "review")]);

test("open high findings below the round limit get an automatic fix decision", () => {
  const step = decide(next(afterReview([finding(3)])));
  assert.equal(step.decide.question, "Fix 1 high finding");
  assert.deepEqual(step.decide.options, [{ id: "fix", label: "Fix" }]);
  assert.equal(step.chosen?.option, "fix");
  assert.match(step.chosen!.reason, /round 1 of 2/);
});

test("a stored rule decision runs implement again without text", () => {
  const f = finding(3);
  const step = run(next(afterReview([f, decision("Fix 1 high finding", { option: "fix", by: "rule", reason: "r" }, 3)])));
  assert.equal(step.run, "implement");
  assert.equal((step.input as { text: string | null }).text, null);
  assert.deepEqual((step.input as { llm: LlmSelection }).llm, IMPL);
});

test("autoFixRounds 0 always asks the user", () => {
  const v = view([...baseArtifacts("never"), result(2), finding(3)], [epoch(1, "investigate"), epoch(2, "implement"), epoch(3, "review")]);
  const step = decide(next(v));
  assert.equal(step.decide.question, REVIEWED);
  assert.equal(step.chosen, undefined);
});

test("automatic fix rounds restart after a user decision", () => {
  const rule = (epochN: number) => decision("Fix 1 high finding", { option: "fix", by: "rule", reason: "r" }, epochN);
  const epochs = [epoch(1, "investigate"), epoch(2, "implement"), epoch(3, "review"), epoch(4, "implement"), epoch(5, "review"), epoch(6, "implement"), epoch(7, "review")];
  const history = [...baseArtifacts(), result(2), finding(3), rule(3), result(4), rule(5), result(6)];
  assert.equal(decide(next(view(history, epochs))).decide.question, REVIEWED, "two rule rounds used up");
  const revised = decision(REVIEWED, { option: "revise", by: "user", text: "more" }, 7);
  const epochs2 = [...epochs, epoch(8, "implement"), epoch(9, "review")];
  const again = decide(next(view([...history, revised, result(8)], epochs2)));
  assert.equal(again.decide.question, "Fix 1 high finding", "a user decision restarts the count");
  assert.equal(again.chosen?.option, "fix");
});

test("dismissed and addressed findings do not count; without open findings the user decides", () => {
  const f = finding(3);
  const dismiss = art("FindingDecision", { finding: f.id, decision: "dismissed" }, 3);
  const links = [{ id: "l", sessionId: "s", from: dismiss.id, to: f.id, kind: "about" as const }];
  const step = decide(next({ ...afterReview([f, dismiss]), links }));
  assert.equal(step.decide.question, REVIEWED);
  assert.deepEqual(step.decide.options.map((o) => o.id), ["revise", "accept", "cancel"]);
  assert.equal(step.decide.options[0]!.takesText, true);
  assert.equal(step.decide.options[0]!.requiresText, undefined);
});

test("revise runs implement with the text; cancel and accept without after-accept phases end the loop", () => {
  const revise = run(next(afterReview([decision(REVIEWED, { option: "revise", by: "user", text: "tweak" }, 3)])));
  assert.equal((revise.input as { text: string }).text, "tweak");
  assert.equal(next(afterReview([decision(REVIEWED, { option: "cancel", by: "user" }, 3)])), null);
  assert.equal(next(afterReview([decision(REVIEWED, { option: "accept", by: "user" }, 3)])), null);
});

test("after Accept the after-accept phases run in order without asking", () => {
  const accept = decision(REVIEWED, { option: "accept", by: "user" }, 3);
  assert.deepEqual(run(next(afterReview([accept], "stack"))), { run: "x", input: { base: "BASE", head: "HEAD1", llm: START } });
  const afterX = view([...baseArtifacts("stack"), result(2), accept], [epoch(1, "investigate"), epoch(2, "implement"), epoch(3, "review"), epoch(4, "x")]);
  assert.equal(run(next(afterX)).run, "y");
  const afterFollowUp = view(afterX.artifacts, [...afterX.epochs, epoch(5, "x-follow-up"), epoch(6, "y")]);
  assert.equal(next(afterFollowUp), null);
  const failedX = view(afterX.artifacts, [...afterX.epochs.slice(0, 3), epoch(4, "x", "failed"), epoch(5, "other")]);
  assert.equal(next(failedX), null);
});

test("phases started outside the workflow (try from chat) leave the open decision of its own last epoch answerable", () => {
  const foreign = [epoch(1, "investigate"), epoch(2, "implement"), epoch(3, "review"), epoch(4, "try"), epoch(5, "tryPush", "failed")];
  const open = decide(next(view([...baseArtifacts("stack"), result(2), decision(REVIEWED, null, 3)], foreign)));
  assert.equal(open.decide.question, REVIEWED);
  assert.equal(open.epoch, 3);
  const revised = view([...baseArtifacts("stack"), result(2), decision(REVIEWED, { option: "revise", by: "user", text: "t" }, 3)], foreign);
  assert.equal(run(next(revised)).run, "implement");
  const accepted = view([...baseArtifacts("stack"), result(2), decision(REVIEWED, { option: "accept", by: "user" }, 3)], [...foreign.slice(0, 3), epoch(4, "x")]);
  assert.equal(run(next(accepted)).run, "y", "an after-accept phase that already ran after the review is not run again");
});

test("a plan that does not hold asks to re-investigate or continue", () => {
  const stuck = result(2, { planInvalid: "no such API" });
  const epochs = [epoch(1, "investigate"), epoch(2, "implement")];
  const question = "The implement agent reports that the plan does not hold: no such API";
  const ask = decide(next(view([...baseArtifacts(), stuck], epochs)));
  assert.equal(ask.decide.question, question);
  assert.deepEqual(ask.decide.options.map((o) => o.id), ["reinvestigate", "continue", "cancel"]);
  assert.equal(ask.decide.options[0]!.defaultText, "no such API");
  const reinvestigate = run(next(view([...baseArtifacts(), stuck, decision(question, { option: "reinvestigate", by: "user" }, 2)], epochs)));
  assert.equal(reinvestigate.run, "investigate");
  assert.equal((reinvestigate.input as { previous: { text: string } }).previous.text, "no such API", "the reason is the feedback when no text is typed");
  const typed = run(next(view([...baseArtifacts(), stuck, decision(question, { option: "reinvestigate", by: "user", text: "try Y" }, 2)], epochs)));
  assert.equal((typed.input as { previous: { text: string } }).previous.text, "try Y");
  const go = run(next(view([...baseArtifacts(), stuck, decision(question, { option: "continue", by: "user", text: "use Z" }, 2)], epochs)));
  assert.equal(go.run, "implement");
  assert.equal((go.input as { ignorePlanInvalid: boolean; text: string }).ignorePlanInvalid, true);
  assert.equal((go.input as { text: string }).text, "use Z");
  assert.equal(next(view([...baseArtifacts(), stuck, decision(question, { option: "cancel", by: "user" }, 2)], epochs)), null);
});

test("an unknown profile is an error", () => {
  assert.throws(() => next(view([start(), branch("missing")], [])), /Unknown repo profile: missing/);
});

test("reviewer comments ask to work in, feed addressed comments to implement, and leave other choices idle", () => {
  const comment = art("PhabComment", { phid: "P1", revision: 7, author: "alice", path: "dom/a.cpp", line: 12, quote: "x = 30;", body: "Name this", done: false }, 8);
  const interpretation = art("CommentInterpretation", { comment: comment.id, phid: "P1", asks: "Name the constant", proposal: "const kMax = 30", action: "address", reply: null }, 8);
  const input = { comments: ["P1"] };
  const reviewComments = epoch(8, "reviewerComments");
  reviewComments.input = input;
  const base = [...baseArtifacts(), result(2), comment, interpretation];
  const epochs = [epoch(1, "investigate"), epoch(2, "implement"), epoch(3, "review"), epoch(4, "try"), epoch(5, "tryPush"), epoch(6, "submit"), epoch(7, "phabSubmit"), reviewComments];
  const open = decide(next(view(base, epochs)));
  assert.equal(open.decide.question, workInQuestion(1));
  assert.deepEqual(open.decide.options.map((o) => o.id), ["work", "later"]);
  assert.equal(open.epoch, 8);

  const chosen = decision(workInQuestion(1), { option: "work", by: "user" }, 8);
  const started = run(next(view([...base, chosen], epochs)));
  assert.equal(started.run, "implement");
  assert.match((started.input as { text: string }).text, /^Address these reviewer comments/);

  const asked = decision(workInQuestion(1), null, 8) as Artifact<DecisionData>;
  assert.equal(implementCheckAnswer(view(base, epochs), asked, "work"), null);
  const replied = art("CommentTriage", { comment: comment.id, phid: "P1", action: "reply", text: "thanks" }, 8);
  assert.equal(implementCheckAnswer(view([...base, replied], epochs), asked, "work"), "No reviewer comment is marked Address.");
  assert.equal(implementCheckAnswer(view([...base, replied], epochs), asked, "later"), null);
  assert.equal(next(view([...base, decision(workInQuestion(1), { option: "later", by: "user" }, 8)], epochs)), null);

  const afterImplement = view([...baseArtifacts(), result(2), comment, interpretation, chosen, result(9)], [...epochs, epoch(9, "implement")]);
  const review = run(next(afterImplement));
  assert.equal(review.run, "review");
  assert.equal((review.input as { update: boolean }).update, true);
});
