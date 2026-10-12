import type { DiagramData, Id, LlmSelection, WriteMode } from "../../../plugin-api.ts";
import type { SpecReferenceData } from "../../spec/api.ts";

/** Comment phids to interpret in the order shown, with an optional model choice. */
export interface ReviewerCommentsInput { comments: string[]; llm?: LlmSelection }
/** The suggested action for a reviewer comment. */
export type CommentAction = "address" | "reply" | "ignore";
/** Private LLM interpretation of a Phabricator comment, linked `about → comment`. */
export interface CommentInterpretationData { comment: Id; phid: string; asks: string; proposal: string; action: CommentAction; reply: string | null }
/** User's mark on a comment, linked `about → comment`; latest per phid wins. */
export interface CommentTriageData { comment: Id; phid: string; action: CommentAction; text: string | null }
/** What the user said when stopping a running phase (artifact `Steer`, verified, linked `about →` the WorkflowStart); stamped with the epoch that was stopped. */
export interface SteerData { text: string; epoch: number; phase: string }

/** Recorded (verified) by the start: where the work lives; `baseSha` is the commit the branch started from, or the fork point of the current branch from main for `current-branch`. */
export interface ImplementBranchData { branch: string; baseSha: string; baseRef: string | null; profile: string; checkout: "new-branch" | "current-branch" }
/** A source location cited by an investigation. */
export interface InvestigationLocation { path: string; line: number; quote: string; why: string }
/** What shows that a plan step works. `new-test`: a test file the plan adds (absent at the base; fails before the fix, passes after). `failing-test`: an existing test that fails at the base and passes after; `baseEvidence` is set by the runtime for a web-platform test from its metadata. `covering-test`: an existing test that must still pass; a later step may name a file an earlier step adds. `measure`: a command run before and after; the user judges the numbers against `goal`. */
export type AcceptanceCheck =
  | { kind: "new-test"; path: string }
  | { kind: "failing-test"; path: string; subtests: string[]; baseEvidence?: string }
  | { kind: "covering-test"; path: string }
  | { kind: "measure"; command: string; goal: string };
/** One planned implementation step. */
export interface InvestigationStep { title: string; message: string; intent: string; checks: AcceptanceCheck[] }
/** The contract any investigate phase must produce (artifact `Investigation`, status proposed). `exploration` is the handoff to the implement agent, which starts without the investigator's context. `diagram` and `specRefs` are optional; `droppedLocations`, `droppedChecks` and `diagramError` are set by the runtime. */
export interface InvestigationData {
  kind: "bugfix" | "feature" | "spec" | "refactor" | "perf"; summary: string;
  bug: number | null;
  locations: InvestigationLocation[];
  testCases: { description: string; expected: string; actual?: string; path?: string }[];
  architecture?: string;
  steps: InvestigationStep[];
  openQuestions: string[];
  exploration: { tried: string; outcome: string }[];
  diagram?: DiagramData;
  specRefs?: SpecReferenceData[];
  droppedLocations?: string[];
  droppedChecks?: string[];
  diagramError?: string;
}
/** The implement agent's structured result. */
export interface ImplementResultData { head: string; branch: string; summary: string; planChange: string | null; planInvalid: string | null }
/** The verdict on one acceptance check: `label` names it, `message` is the problem or what ran, `runs` are the `CommandRun`s that prove it. */
export interface CheckResult { step: number; check: number; label: string; ok: boolean; message: string; runs: Id[] }
/** Per-attempt verdicts of an implement epoch (artifact `CheckResults`, verified); the latest in an epoch is current. */
export interface CheckResultsData { results: CheckResult[] }
/** The provider session of the implement agent, recorded (verified) when the session starts so a cancelled run leaves it behind; stamped with the epoch. */
export interface AgentSessionData { providerSessionId: string; backend: string; model: string }
/** A rewrite of the stack by a tool the user confirmed (moz-phab adds trailers to every commit): implement accepts `to` as its own tip. Artifact `StackRewrite`, verified. */
export interface StackRewriteData { from: string; to: string; by: string }
