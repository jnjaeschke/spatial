import { type Artifact, type DecisionData, type DecisionOption, type Id, type LlmSelection, type RepoProfile, type Runtime, type Step, type WorkflowContext, type WorkflowStartData, type WorkflowView } from "../../../plugin-api.ts";
import type { ImplementBranchData, ImplementResultData, InvestigationData } from "../shared/types.ts";
import type { ImplementInput } from "../tasks/implement/task.ts";
import type { ReviewPhaseInput } from "../../review/api.ts";
import { openHighFindings } from "../runtime/findings.ts";
import { commentPlan } from "../shared/comment-plan.ts";
import type { ReviewerCommentsInput } from "../shared/types.ts";
import { commentsFeedback } from "../runtime/comments-feedback.ts";
import { chosenDecision, latestArtifact, plural, startProfile, workflowView } from "../../../plugin-api.ts";

export const APPROVE = "Approve the investigation plan?";
export const REVIEWED = "The self-review is done. What next?";
export const workInQuestion = (count: number): string => `Work in ${plural(count, "reviewer comment")}?`;
const planInvalidQuestion = (reason: string) => `The implement agent reports that the plan does not hold: ${reason}`;
const fixQuestion = (count: number) => `Fix ${plural(count, "high finding")}`;
const REVIEW_KEYS = new Set(["review-fix", "reviewed"]);

const decisionsOf = (view: WorkflowView) => view.artifacts.filter((a) => a.type === "Decision") as Artifact<DecisionData>[];

function ruleRounds(decisions: Artifact<DecisionData>[]): number {
  let count = 0;
  for (const { data } of [...decisions].reverse()) {
    if (!data.chosen) continue;
    if (data.chosen.by === "user") break;
    if (data.chosen.by === "rule" && data.chosen.option === "fix") count++;
  }
  return count;
}

function bugOf(decisions: Artifact<DecisionData>[], investigation: Artifact<InvestigationData>): number | null {
  if (investigation.data.bug !== null) return investigation.data.bug;
  const text = decisions.findLast((a) => a.data.key === "approve" && a.data.chosen?.option === "approve")?.data.chosen?.text;
  return text ? Number(text) : null;
}

function chosenImplementLlm(decisions: Artifact<DecisionData>[]): LlmSelection | undefined {
  return decisions.findLast((a) => a.data.key === "approve" && a.data.chosen?.option === "approve")?.data.chosen?.llm;
}

function investigateStep(start: Artifact<WorkflowStartData>, branch: Artifact<ImplementBranchData>, profile: RepoProfile, llm: LlmSelection | undefined, previous?: { id: Id; text: string }): Step {
  const params = start.data.params as { request: string };
  return { run: profile.investigatePhase ?? "investigate", input: { request: params.request, baseSha: branch.data.baseSha, branch: branch.data.branch, ...(previous ? { previous } : {}), ...(llm ? { llm } : {}) } };
}

interface ImplementStepOptions {
  branch: Artifact<ImplementBranchData>;
  investigation: Artifact<InvestigationData>;
  bug: number | null;
  text: string | null;
  fix: Id[];
  ignorePlanInvalid?: boolean;
  llm: LlmSelection | undefined;
  start: Artifact<WorkflowStartData>;
}

function implementStep({ branch, investigation, bug, text, fix, ignorePlanInvalid, llm, start }: ImplementStepOptions): Step {
  return { run: "implement", input: { branchId: branch.id, investigationId: investigation.id, bug, text, fix, ...(ignorePlanInvalid ? { ignorePlanInvalid: true } : {}), writeMode: start.data.writeMode ?? "auto", ...(llm ? { llm } : {}) } };
}

function afterAcceptStep(view: WorkflowView, profile: RepoProfile, branch: Artifact<ImplementBranchData>, result: Artifact<ImplementResultData>, start: Artifact<WorkflowStartData>, acceptEpoch: number): Step | null {
  for (const phase of profile.afterAccept ?? []) {
    const ran = view.epochs.findLast((epoch) => epoch.phase === phase && epoch.n > acceptEpoch);
    if (!ran) return { run: phase, input: { base: branch.data.baseSha, head: result.data.head, ...(start.data.llm ? { llm: start.data.llm } : {}) } };
    if (ran.status !== "succeeded") return null;
  }
  return null;
}

const ownPhases = (profile: RepoProfile) => new Set([profile.investigatePhase ?? "investigate", "implement", "review", "reviewerComments"]);

/** Chooses the next implement workflow phase or decision from stored session state. */
export function implementNext(view: WorkflowView, ctx: WorkflowContext): Step | null {
  const start = latestArtifact<WorkflowStartData>(view.artifacts, "WorkflowStart"), branch = latestArtifact<ImplementBranchData>(view.artifacts, "ImplementBranch");
  const profile = startProfile(ctx.repoProfiles, view);
  if (!start || !branch || !profile) return null;
  // Phases started outside the workflow (a try push from chat) leave its own last epoch and that epoch's decision in charge.
  const investigatePhase = profile.investigatePhase ?? "investigate", own = ownPhases(profile);
  const last = view.epochs.findLast((epoch) => own.has(epoch.phase));
  if (!last) return investigateStep(start, branch, profile, start.data.llm);
  if (last.status !== "succeeded") return null;

  const decisions = decisionsOf(view), investigation = latestArtifact<InvestigationData>(view.artifacts, "Investigation"), result = latestArtifact<ImplementResultData>(view.artifacts, "ImplementResult");
  const open = openHighFindings(view);
  const decisionStep = (key: string, question: string, options: DecisionOption[], chosen?: { option: string; reason: string }): Step => ({ decide: { key, question, options }, ...(chosen ? { chosen } : {}), epoch: last.n });
  const llm = (selection: LlmSelection | undefined) => selection ? { llm: selection } : {};
  const approve = chosenDecision(view, last.n, "approve");
  const implementLlm = chosenImplementLlm(decisions) ?? start.data.llm;
  const again = (investigation: Artifact<InvestigationData>, text: string | null, ignorePlanInvalid = false): Step =>
    implementStep({ branch, investigation, bug: bugOf(decisions, investigation), text, fix: open.map((finding) => finding.id), ignorePlanInvalid, llm: implementLlm, start });
  if (last.phase === investigatePhase) {
    if (!investigation) return null;
    if (!approve) {
      const needsBug = Boolean(profile.requiresBug && investigation.data.bug === null);
      return decisionStep("approve", APPROVE, [
        { id: "approve", label: "Approve", takesModel: true, ...(needsBug ? { takesText: true, requiresText: true, textPattern: "^\\d+$" } : {}) },
        { id: "revise", label: "Revise", takesText: true, requiresText: true }, { id: "cancel", label: "Cancel" },
      ]);
    }
    if (approve.option === "approve") return again(investigation, null);
    if (approve.option === "revise") return investigateStep(start, branch, profile, start.data.llm, { id: investigation.id, text: approve.text ?? "" });
    return null;
  }

  if (last.phase === "implement") {
    if (!result || !investigation) return null;
    if (result.data.planInvalid) {
      const reason = result.data.planInvalid, question = planInvalidQuestion(reason), choice = chosenDecision(view, last.n, "plan-invalid");
      if (!choice) return decisionStep("plan-invalid", question, [
        { id: "reinvestigate", label: "Re-investigate", takesText: true, defaultText: reason },
        { id: "continue", label: "Continue anyway", takesText: true }, { id: "cancel", label: "Cancel" },
      ]);
      if (choice.option === "reinvestigate") return investigateStep(start, branch, profile, start.data.llm, { id: investigation.id, text: choice.text ?? reason });
      if (choice.option === "continue") return again(investigation, choice.text ?? null, true);
      return null;
    }
    const fix = (last.input as Partial<ImplementInput> | null)?.fix ?? [];
    const input: ReviewPhaseInput = { base: branch.data.baseSha, head: result.data.head, update: view.epochs.some((epoch) => epoch.phase === "review"), ...llm(start.data.llm), ...(fix.length ? { recheck: fix } : {}) };
    return { run: "review", input };
  }

  if (last.phase === "review") {
    const choice = decisions.findLast((a) => a.epoch === last.n && REVIEW_KEYS.has(a.data.key) && a.data.chosen)?.data.chosen;
    if (choice) {
      if (choice.option === "fix") return investigation && result ? again(investigation, null) : null;
      if (choice.option === "revise") return investigation && result ? again(investigation, choice.text ?? null) : null;
      if (choice.option === "accept") return result ? afterAcceptStep(view, profile, branch, result, start, last.n) : null;
      return null;
    }
    const rounds = ruleRounds(decisions), max = profile.autoFixRounds ?? 2;
    if (open.length > 0 && rounds < max) return decisionStep("review-fix", fixQuestion(open.length), [{ id: "fix", label: "Fix" }], { option: "fix", reason: `${plural(open.length, "high finding")} open; automatic fix round ${rounds + 1} of ${max}` });
    return decisionStep("reviewed", REVIEWED, [{ id: "revise", label: "Revise", takesText: true }, { id: "accept", label: "Accept" }, { id: "cancel", label: "Cancel" }]);
  }

  if (last.phase === "reviewerComments") {
    const items = commentPlan(view, last), question = workInQuestion((last.input as ReviewerCommentsInput).comments.length), choice = chosenDecision(view, last.n, "work-in");
    if (!choice) return decisionStep("work-in", question, [{ id: "work", label: "Work in" }, { id: "later", label: "Not yet" }]);
    const text = choice.option === "work" ? commentsFeedback(items) : null;
    return text && investigation && result ? again(investigation, text) : null;
  }
  return null;
}

/** Refuses Work in when no reviewer comment is marked Address: the answer would start nothing and consume the decision. */
export function implementCheckAnswer(view: WorkflowView, decision: Artifact<DecisionData>, option: string): string | null {
  if (option !== "work" || decision.data.key !== "work-in") return null;
  const epoch = view.epochs.find((e) => e.n === decision.epoch);
  if (epoch?.phase !== "reviewerComments") return null;
  return commentsFeedback(commentPlan(view, epoch)) === null ? "No reviewer comment is marked Address." : null;
}

/** Whether an implement session still holds its checkout: an epoch is running, the session has a next step (an open decision included), or the latest epoch of a phase the workflow owns failed or was cancelled and can be retried. An abandoned session holds nothing. Used to refuse a second session on the same checkout. */
export function isActive(rt: Runtime, sessionId: Id): boolean {
  if (rt.store.listArtifacts(sessionId, "Abandoned").length > 0) return false;
  if (rt.runningEpoch(sessionId) !== null || rt.nextStep(sessionId) !== null) return true;
  const view = workflowView(rt.store, sessionId);
  const branch = latestArtifact<ImplementBranchData>(view.artifacts, "ImplementBranch");
  const profile = branch && startProfile(rt.plugins.repoProfiles, view);
  if (!profile) return false;
  const own = ownPhases(profile);
  const status = view.epochs.findLast((epoch) => own.has(epoch.phase))?.status;
  return status === "failed" || status === "cancelled";
}
