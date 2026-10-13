import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, DecisionData, DecisionOption, Epoch, EpochStatus, LlmSelection, RepoProfile, Step, WorkflowView } from "../../../src/plugin-api.ts";
import { implementCheckAnswer, implementNext, workInQuestion } from "../../../src/plugins/implement/workflow/next.ts";

let n = 0;
const art = (type: string, data: unknown, epoch: number | null): Artifact => ({ id: `${type}${++n}`, sessionId: "s", type, status: "verified", data, provenance: { taskId: "t" }, epoch, createdAt: "" });
const epoch = (num: number, phase: string, status: EpochStatus = "succeeded"): Epoch => ({ sessionId: "s", n: num, phase, status, input: null, error: null, startedAt: "", endedAt: "" });
const sel = (model: string): LlmSelection => ({ backend: "claude", model, effort: "low" });
const START = sel("start"), IMPL = sel("impl");
const plain: RepoProfile = { id: "plain", description: "p", commitStyle: "single" };
const stack: RepoProfile = { id: "stack", description: "s", commitStyle: "stack", requiresBug: true, afterAccept: ["x", "y"] };
const never: RepoProfile = { id: "never", description: "n", commitStyle: "single", autoFixRounds: 0 };
const profiles = new Map([plain, stack, never].map((p) => [p.id, p]));

const start = (profile = "plain") => art("WorkflowStart", { via: "command", workflow: "implement", profile, params: { request: "fix it", profile: null, checkout: null }, title: "t", prompt: "fix it", llm: START, writeMode: "editsOnly" }, null);
const branch = () => art("ImplementBranch", { branch: "spatial/x", baseSha: "BASE", baseRef: "main", checkout: "new-branch" }, null);
const investigation = (bug: number | null, epochN = 1) => art("Investigation", { kind: "bugfix", summary: "S", bug, locations: [], testCases: [], steps: [], openQuestions: [], exploration: [] }, epochN);
const result = (epochN: number, over: object = {}) => art("ImplementResult", { head: "HEAD1", branch: "spatial/x", summary: "s", planChange: null, planInvalid: null, ...over }, epochN);
const decision = (key: string, question: string, chosen: DecisionData["chosen"], epochN: number, options: DecisionOption[] = []) => art("Decision", { key, question, options, chosen } satisfies DecisionData, epochN);
const finding = (epochN: number) => art("ReviewFinding", { anchor: "a", severity: "high", title: "T", body: "B" }, epochN);
const view = (artifacts: Artifact[], epochs: Epoch[], links: WorkflowView["links"] = []): WorkflowView => ({ artifacts, links, epochs });
const next = (v: WorkflowView) => implementNext(v, { repoProfiles: profiles });
const decide = (step: Step | null) => (step && "decide" in step ? step : assert.fail(`not a decision: ${JSON.stringify(step)}`));
const run = (step: Step | null) => (step && "run" in step ? step : assert.fail(`not a run: ${JSON.stringify(step)}`));
const APPROVE = "Approve the investigation plan?", REVIEWED = "The self-review is done. What next?";

test("without epochs the investigation starts with the start box selection", () => {
  const step = run(next(view([start(), branch()], [])));
  assert.equal(step.run, "investigate");
  assert.deepEqual(step.input, { request: "fix it", baseSha: "BASE", branch: "spatial/x", llm: START });
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
  const withoutBug = decide(next(view([start("stack"), branch(), investigation(null)], [epoch(1, "investigate")])));
  assert.deepEqual(withoutBug.decide.options[0], { id: "approve", label: "Approve", takesModel: true, takesText: true, requiresText: true, textPattern: "^\\d+$" });
  const withBug = decide(next(view([start("stack"), branch(), investigation(77)], [epoch(1, "investigate")])));
  assert.equal(withBug.decide.options[0]!.requiresText, undefined);
});

test("approval starts implement with the chosen model, the bug from the text and the start's write mode", () => {
  const v = (text?: string) => view([start("stack"), branch(), investigation(null), decision("approve", APPROVE, { option: "approve", by: "user", ...(text ? { text } : {}), llm: IMPL }, 1)], [epoch(1, "investigate")]);
  const step = run(next(v("4711")));
  assert.equal(step.run, "implement");
  const { branchId, investigationId, ...rest } = step.input as { branchId: string; investigationId: string };
  assert.ok(branchId && investigationId);
  assert.deepEqual(rest, { bug: 4711, text: null, fix: [], writeMode: "editsOnly", llm: IMPL });
  const withKnownBug = run(next(view([start("stack"), branch(), investigation(77), decision("approve", APPROVE, { option: "approve", by: "user" }, 1)], [epoch(1, "investigate")])));
  assert.equal((withKnownBug.input as { bug: number; llm: LlmSelection }).bug, 77);
  assert.deepEqual((withKnownBug.input as { llm: LlmSelection }).llm, START, "no chosen model falls back to the start selection");
});

test("the approve text is the bug number as typed, and a known bug needs no text", () => {
  const typed = run(next(view([start("stack"), branch(), investigation(null), decision("approve", APPROVE, { option: "approve", by: "user", text: "4711" }, 1)], [epoch(1, "investigate")])));
  assert.equal((typed.input as { bug: number }).bug, 4711);
  const known = run(next(view([start("stack"), branch(), investigation(77), decision("approve", APPROVE, { option: "approve", by: "user" }, 1)], [epoch(1, "investigate")])));
  assert.equal((known.input as { bug: number }).bug, 77);
});

test("revise reinvestigates with the previous investigation and the text; cancel stops", () => {
  const inv = investigation(null);
  const revise = run(next(view([start(), branch(), inv, decision("approve", APPROVE, { option: "revise", by: "user", text: "look at X" }, 1)], [epoch(1, "investigate")])));
  assert.equal(revise.run, "investigate");
  assert.deepEqual((revise.input as { previous: unknown }).previous, { id: inv.id, text: "look at X" });
  assert.equal(next(view([start(), branch(), inv, decision("approve", APPROVE, { option: "cancel", by: "user" }, 1)], [epoch(1, "investigate")])), null);
});

test("a replacement investigate phase is honoured through the profile", () => {
  const custom: RepoProfile = { id: "custom", description: "c", commitStyle: "single", investigatePhase: "my-investigate" };
  const v = view([start("custom"), branch()], []);
  assert.equal(run(implementNext(v, { repoProfiles: new Map([["custom", custom]]) })).run, "my-investigate");
});

const baseArtifacts = (profile = "plain", bug: number | null = null) => {
  const inv = investigation(bug);
  return [start(profile), branch(), inv, decision("approve", APPROVE, { option: "approve", by: "user", llm: IMPL, ...(profile === "stack" ? { text: "5" } : {}) }, 1)];
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
  const step = run(next(afterReview([f, decision("review-fix", "Fix 1 high finding", { option: "fix", by: "rule", reason: "r" }, 3)])));
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
  const rule = (epochN: number) => decision("review-fix", "Fix 1 high finding", { option: "fix", by: "rule", reason: "r" }, epochN);
  const epochs = [epoch(1, "investigate"), epoch(2, "implement"), epoch(3, "review"), epoch(4, "implement"), epoch(5, "review"), epoch(6, "implement"), epoch(7, "review")];
  const history = [...baseArtifacts(), result(2), finding(3), rule(3), result(4), rule(5), result(6)];
  assert.equal(decide(next(view(history, epochs))).decide.question, REVIEWED, "two rule rounds used up");
  const revised = decision("reviewed", REVIEWED, { option: "revise", by: "user", text: "more" }, 7);
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
  const revise = run(next(afterReview([decision("reviewed", REVIEWED, { option: "revise", by: "user", text: "tweak" }, 3)])));
  assert.equal((revise.input as { text: string }).text, "tweak");
  assert.equal(next(afterReview([decision("reviewed", REVIEWED, { option: "cancel", by: "user" }, 3)])), null);
  assert.equal(next(afterReview([decision("reviewed", REVIEWED, { option: "accept", by: "user" }, 3)])), null);
});

test("after Accept the after-accept phases run in order without asking", () => {
  const accept = decision("reviewed", REVIEWED, { option: "accept", by: "user" }, 3);
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
  const open = decide(next(view([...baseArtifacts("stack"), result(2), decision("reviewed", REVIEWED, null, 3)], foreign)));
  assert.equal(open.decide.question, REVIEWED);
  assert.equal(open.epoch, 3);
  const revised = view([...baseArtifacts("stack"), result(2), decision("reviewed", REVIEWED, { option: "revise", by: "user", text: "t" }, 3)], foreign);
  assert.equal(run(next(revised)).run, "implement");
  const accepted = view([...baseArtifacts("stack"), result(2), decision("reviewed", REVIEWED, { option: "accept", by: "user" }, 3)], [...foreign.slice(0, 3), epoch(4, "x")]);
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
  const reinvestigate = run(next(view([...baseArtifacts(), stuck, decision("plan-invalid", question, { option: "reinvestigate", by: "user" }, 2)], epochs)));
  assert.equal(reinvestigate.run, "investigate");
  assert.equal((reinvestigate.input as { previous: { text: string } }).previous.text, "no such API", "the reason is the feedback when no text is typed");
  const typed = run(next(view([...baseArtifacts(), stuck, decision("plan-invalid", question, { option: "reinvestigate", by: "user", text: "try Y" }, 2)], epochs)));
  assert.equal((typed.input as { previous: { text: string } }).previous.text, "try Y");
  const go = run(next(view([...baseArtifacts(), stuck, decision("plan-invalid", question, { option: "continue", by: "user", text: "use Z" }, 2)], epochs)));
  assert.equal(go.run, "implement");
  assert.equal((go.input as { ignorePlanInvalid: boolean; text: string }).ignorePlanInvalid, true);
  assert.equal((go.input as { text: string }).text, "use Z");
  assert.equal(next(view([...baseArtifacts(), stuck, decision("plan-invalid", question, { option: "cancel", by: "user" }, 2)], epochs)), null);
});

test("an unknown profile is an error", () => {
  assert.throws(() => next(view([start("missing"), branch()], [])), /Unknown repo profile: missing/);
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

  const chosen = decision("work-in", workInQuestion(1), { option: "work", by: "user" }, 8);
  const started = run(next(view([...base, chosen], epochs)));
  assert.equal(started.run, "implement");
  assert.match((started.input as { text: string }).text, /^Address these reviewer comments/);

  const asked = decision("work-in", workInQuestion(1), null, 8) as Artifact<DecisionData>;
  assert.equal(implementCheckAnswer(view(base, epochs), asked, "work"), null);
  const replied = art("CommentTriage", { comment: comment.id, phid: "P1", action: "reply", text: "thanks" }, 8);
  assert.equal(implementCheckAnswer(view([...base, replied], epochs), asked, "work"), "No reviewer comment is marked Address.");
  assert.equal(implementCheckAnswer(view([...base, replied], epochs), asked, "later"), null);
  assert.equal(next(view([...base, decision("work-in", workInQuestion(1), { option: "later", by: "user" }, 8)], epochs)), null);

  const afterImplement = view([...baseArtifacts(), result(2), comment, interpretation, chosen, result(9)], [...epochs, epoch(9, "implement")]);
  const review = run(next(afterImplement));
  assert.equal(review.run, "review");
  assert.equal((review.input as { update: boolean }).update, true);
});

test("each decision carries its stable key", () => {
  assert.equal(decide(next(view([start(), branch(), investigation(null)], [epoch(1, "investigate")]))).decide.key, "approve");
  assert.equal(decide(next(afterReview([finding(3)]))).decide.key, "review-fix");
  assert.equal(decide(next(afterReview([]))).decide.key, "reviewed");
  const stuck = result(2, { planInvalid: "no such API" });
  assert.equal(decide(next(view([...baseArtifacts(), stuck], [epoch(1, "investigate"), epoch(2, "implement")]))).decide.key, "plan-invalid");
});

test("an answer is found by key and epoch, whatever its question text says", () => {
  const reworded = art("Decision", { key: "reviewed", question: "Another wording", options: [], chosen: { option: "revise", by: "user", text: "t" } } satisfies DecisionData, 3);
  assert.equal(run(next(afterReview([reworded]))).run, "implement");
  const otherKey = art("Decision", { key: "something-else", question: REVIEWED, options: [], chosen: { option: "revise", by: "user", text: "t" } } satisfies DecisionData, 3);
  assert.equal(decide(next(afterReview([otherKey]))).decide.key, "reviewed");
});

test("an implement round is asked to fix the findings open when it was started, and the next review rechecks exactly those", () => {
  const f = finding(3);
  const revised = decision("reviewed", REVIEWED, { option: "revise", by: "user", text: "more" }, 3);
  const started = run(next(afterReview([f, revised])));
  assert.deepEqual((started.input as { fix: string[] }).fix, [f.id]);
  const implementEpoch = { ...epoch(4, "implement"), input: started.input };
  const reviewing = view([...baseArtifacts(), result(2), f, revised, result(4)], [epoch(1, "investigate"), epoch(2, "implement"), epoch(3, "review"), implementEpoch]);
  assert.deepEqual(run(next(reviewing)), { run: "review", input: { base: "BASE", head: "HEAD1", update: true, llm: START, recheck: [f.id] } });
  const clean = run(next(afterReview([decision("reviewed", REVIEWED, { option: "revise", by: "user", text: "more" }, 3)])));
  assert.deepEqual((clean.input as { fix: string[] }).fix, []);
  const cleanReview = view([...baseArtifacts(), result(2), result(4)], [epoch(1, "investigate"), epoch(2, "implement"), epoch(3, "review"), { ...epoch(4, "implement"), input: clean.input }]);
  assert.equal("recheck" in (run(next(cleanReview)).input as object), false);
});

test("adopt asks for a branch, records the selected range, and replays rounds", () => {
  const planData = {
    mode: "moved", host: "https://phab.example.com", refError: null, historyError: null, missingBases: ["OLD"],
    branches: [
      { branch: "b0", base: "BASE", tip: "c2", commits: [{ sha: "c1", subject: "one", body: "Differential Revision: https://phab.example.com/D1" }, { sha: "c2", subject: "two", body: "Differential Revision: https://phab.example.com/D2" }] },
      { branch: "b1", base: "BASE", tip: "d1", commits: [{ sha: "d1", subject: "other", body: "" }] },
    ],
    revisions: [{ id: 1, title: "Part 1", latestDiffId: 20 }, { id: 2, title: "Part 2", latestDiffId: 21 }],
    diffs: [{ revision: 1, diffId: 10, base: "OLD", dateCreated: 0 }, { revision: 2, diffId: 11, base: "OLD", dateCreated: 5 }, { revision: 1, diffId: 20, base: "NEW", dateCreated: 9000 }, { revision: 2, diffId: 21, base: "NEW", dateCreated: 9005 }],
  };
  const adoptEpoch = { ...epoch(4, "adopt"), input: { mode: "renamed" } };
  const plan = art("AdoptPlan", planData, 4);
  const initial = decide(next(view([start(), branch(), plan], [adoptEpoch])));
  assert.equal(initial.decide.key, "adopt-branch");
  assert.deepEqual(initial.decide.options.map((o) => o.id), ["b0", "b1", "other", "cancel"]);
  const selected = decision("adopt-branch", "Adopt which branch?", { option: "b0", by: "user" }, 4);
  const head = decide(next(view([start(), branch(), plan, selected], [adoptEpoch])));
  assert.equal(head.decide.key, "adopt-head");
  assert.match(head.decide.question, /git fetch origin OLD/);
  assert.deepEqual(head.decide.options.slice(0, 2).map((o) => o.id), ["c2", "c1"]);
  const roundsPlan = art("AdoptPlan", { ...planData, missingBases: [] }, 4);
  const range = { planId: roundsPlan.id, branch: "b0", head: "c2" };
  const recorded = { ...epoch(5, "adoptRange"), input: range };
  const firstRound = run(next(view([start(), branch(), roundsPlan], [adoptEpoch, recorded])));
  assert.equal(firstRound.run, "round");
  assert.equal((firstRound.input as { round: { kind: string } }).round.kind, "phabricator");
  const round1 = { ...epoch(6, "round"), input: firstRound.input };
  const secondRound = run(next(view([start(), branch(), roundsPlan], [adoptEpoch, recorded, round1])));
  assert.equal((secondRound.input as { round: { kind: string }; narrate: boolean }).round.kind, "local");
  assert.equal((secondRound.input as { narrate: boolean }).narrate, true);
  const round2 = { ...epoch(7, "round"), input: secondRound.input };
  assert.equal(next(view([start(), branch(), roundsPlan], [adoptEpoch, recorded, round1, round2])), null);
});

test("a single-commit adopt skips choices and stale review decisions do not override adopt", () => {
  const plan = art("AdoptPlan", { mode: "moved", host: null, refError: null, historyError: null, missingBases: [], branches: [{ branch: "topic", base: "BASE", tip: "c1", commits: [{ sha: "c1", subject: "one", body: "" }] }], revisions: [], diffs: [] }, 4);
  const old = decision("reviewed", REVIEWED, { option: "accept", by: "user" }, 3);
  const adoptEpoch = { ...epoch(4, "adopt"), input: { mode: "moved" } };
  const range = run(next(view([start(), branch(), plan, old], [epoch(3, "review"), adoptEpoch])));
  assert.equal(range.run, "adoptRange");
  assert.deepEqual(range.input, { planId: plan.id, branch: "topic", head: "c1" });
});

test("Other… under adopt-branch adopts again with the named branch, and a named branch skips the branch question", () => {
  const twoBranches = { mode: "renamed", host: null, refError: null, historyError: null, missingBases: [], revisions: [], diffs: [], branches: [
    { branch: "b0", base: "BASE", tip: "c1", commits: [{ sha: "c1", subject: "one", body: "" }] },
    { branch: "b1", base: "BASE", tip: "d1", commits: [{ sha: "d1", subject: "other", body: "" }] },
  ] };
  const plan = art("AdoptPlan", twoBranches, 4);
  const other = decision("adopt-branch", "Adopt which branch?", { option: "other", by: "user", text: " bug-2 " }, 4);
  const again = run(next(view([start(), branch(), plan, other], [{ ...epoch(4, "adopt"), input: { mode: "renamed" } }])));
  assert.deepEqual(again, { run: "adopt", input: { mode: "choose", ref: "bug-2" } });
  const named = art("AdoptPlan", { ...twoBranches, mode: "choose", branches: [{ branch: "bug-2", base: "BASE", tip: "e2", commits: [{ sha: "e1", subject: "1", body: "" }, { sha: "e2", subject: "2", body: "" }] }] }, 5);
  const head = decide(next(view([start(), branch(), named], [{ ...epoch(5, "adopt"), input: { mode: "choose", ref: "bug-2" } }])));
  assert.equal(head.decide.key, "adopt-head");
  const missing = art("AdoptPlan", { ...twoBranches, mode: "choose", refError: "Branch nope does not exist" }, 6);
  const retry = decide(next(view([start(), branch(), missing], [{ ...epoch(6, "adopt"), input: { mode: "choose", ref: "nope" } }])));
  assert.equal(retry.decide.key, "adopt-branch");
  assert.match(retry.decide.question, /^Branch nope does not exist\. /);
});

test("only the last round of an adopt carries the start's model", () => {
  const H = "https://phab.example.com";
  const plan = art("AdoptPlan", {
    mode: "moved", host: H, refError: null, historyError: null, missingBases: [],
    branches: [{ branch: "b0", base: "BASE", tip: "c1", commits: [{ sha: "c1", subject: "one", body: `Differential Revision: ${H}/D1` }] }],
    revisions: [{ id: 1, title: "Part 1", latestDiffId: 20 }],
    diffs: [{ revision: 1, diffId: 10, base: "OLD", dateCreated: 0 }, { revision: 1, diffId: 20, base: "NEW", dateCreated: 9000 }],
  }, 4);
  const range = { ...epoch(5, "adoptRange"), input: { planId: plan.id, branch: "b0", head: "c1" } };
  const first = run(next(view([start(), branch(), plan], [epoch(4, "adopt"), range])));
  assert.equal("llm" in (first.input as object), false);
  const second = run(next(view([start(), branch(), plan], [epoch(4, "adopt"), range, { ...epoch(6, "round"), input: first.input }])));
  assert.deepEqual((second.input as { llm: LlmSelection }).llm, START);
});

test("an adopt without trailers asks what next: self-review, revise or accept", () => {
  const ADOPTED = "Adopted 2 commits from topic. What next?";
  const plan = art("AdoptPlan", { mode: "moved", host: null, refError: null, historyError: null, missingBases: [], revisions: [], diffs: [], branches: [{ branch: "topic", base: "BASE", tip: "c2", commits: [{ sha: "c1", subject: "one", body: "" }, { sha: "c2", subject: "two", body: "" }] }] }, 4);
  const range = { ...epoch(5, "adoptRange"), input: { planId: plan.id, branch: "topic", head: "c2" } };
  const round = { ...epoch(6, "round"), input: { round: { kind: "local", base: "BASE", head: "c2", host: null, phab: null }, narrate: true, llm: START } };
  const diff = art("Diff", { baseSha: "BASE", headSha: "c2", commits: [{ sha: "c1" }, { sha: "c2" }] }, 6);
  const base = (profile = "plain") => [start(profile), branch(), investigation(77), plan, result(5, { head: "c2", branch: "topic" }), diff];
  const epochs = [epoch(1, "investigate"), epoch(4, "adopt"), range, round];
  const asked = decide(next(view(base(), epochs)));
  assert.equal(asked.decide.key, "adopted");
  assert.equal(asked.decide.question, ADOPTED);
  assert.deepEqual(asked.decide.options.map((o) => [o.id, !!o.takesText, !!o.requiresText]), [["self-review", false, false], ["revise", true, true], ["accept", false, false], ["cancel", false, false]]);
  const answer = (option: string, text?: string) => decision("adopted", ADOPTED, { option, by: "user", ...(text ? { text } : {}) }, 6);
  assert.deepEqual(run(next(view([...base(), answer("self-review")], epochs))), { run: "review", input: { base: "BASE", head: "c2", update: true, llm: START } });
  const revise = run(next(view([...base(), answer("revise", "split it")], epochs)));
  assert.equal(revise.run, "implement");
  assert.equal((revise.input as { text: string }).text, "split it");
  assert.equal(run(next(view([...base("stack"), answer("accept")], epochs))).run, "x");
  assert.equal(next(view([...base(), answer("cancel")], epochs)), null);
});
