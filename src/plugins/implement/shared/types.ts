import type { Commit, DiagramData, Id, LlmSelection } from "../../../plugin-api.ts";
import type { SpecReferenceData } from "../../spec/api.ts";
import type { RoundDiff } from "../../review/api.ts";

/** How an adopt finds branches: the session's branch moved, it is gone and related branches exist, or the user chooses. */
export type AdoptMode = "moved" | "renamed" | "choose";
/** `ref`: the local branch the user named under "Other…". */
export interface AdoptInput { mode: AdoptMode; ref?: string }
/** A branch an adopt can take over: `commits` are `base..tip`, oldest first, at most 200. */
export interface AdoptBranch { branch: string; base: string; tip: string; commits: Commit[] }
/** What an adopt can take over (artifact `AdoptPlan`, verified). `diffs` contains every Phabricator diff for trailer revisions; `missingBases` are diff bases absent locally; history errors preserve local adoption without rounds. */
export interface AdoptPlanData { mode: AdoptMode; host: string | null; branches: AdoptBranch[]; revisions: { id: number; title: string; latestDiffId: number }[]; diffs: RoundDiff[]; missingBases: string[]; refError: string | null; historyError: string | null }
/** The branch range selected from an adopt plan. */
export interface AdoptRangeInput { planId: Id; branch: string; head: string }

/** Comment phids to interpret in the order shown, with an optional model choice. */
export interface ReviewerCommentsInput { comments: string[]; llm?: LlmSelection }
/** The suggested action for a reviewer comment. */
export type CommentAction = "address" | "reply" | "ignore";
/** Private LLM interpretation of a Phabricator comment, linked `about → comment`. */
export interface CommentInterpretationData { comment: Id; phid: string; asks: string; proposal: string; action: CommentAction; reply: string | null }
/** User's mark on a comment, linked `about → comment`; latest per phid wins. */
export interface CommentTriageData { comment: Id; phid: string; action: CommentAction; text: string | null }
/** What the user said when stopping a running phase (artifact `Steer`, verified, linked `about →` the WorkflowStart); stamped with the epoch that was stopped. */
/** What the user told a running agent. `live`: handed to the running agent, which kept working; otherwise the run was stopped and rerun with it. */
export interface SteerData { text: string; epoch: number; phase: string; live?: true }

/** Where a memory applies: this session only, the session's repository (`Session.repoDir`), or every repository. */
export type MemoryScope = "session" | "repo" | "global";
/** A way the user wants the agent to work, distilled from a steer (knowledge store, namespace `implement`, key `memory/<slug>`). Empty `kinds` applies to every investigation kind. `source` is set by the runtime. */
export interface SteerMemory {
  situation: string; observed: string; wanted: string; why: string | null;
  phases: string[]; kinds: string[];
  source: { sessionId: Id; epoch: number; steer: Id };
}
/** The current version of a memory with its scope and slug; `confirmed` when the user confirmed this very version. */
export interface MemoryView { scope: MemoryScope; key: string; entryId: Id; memory: SteerMemory; confirmed: boolean }
/** Tells the user a steer was remembered (artifact `MemoryNotice`, verified, linked `about →` the steer). Carries the whole memory: the knowledge store cannot read a superseded version, and "Edit instead" restores it. */
export interface MemoryNoticeData { key: string; scope: MemoryScope; entryId: Id; memory: SteerMemory }
/** The user's reaction to a notice (artifact `MemoryReaction`, linked `about →` the notice). */
export interface MemoryReactionData { notice: Id; reaction: "up" | "down" }
/** The memories a task put in its prompt (artifact `UsedMemories`, verified, stamped with the epoch). */
export interface UsedMemoriesData { entries: { scope: MemoryScope; key: string; entryId: Id }[] }

/** Recorded (verified) by the start: where the work lives; `baseSha` is the commit the branch started from, or the fork point of the current branch from main for `current-branch`. */
export interface ImplementBranchData { branch: string; baseSha: string; baseRef: string | null; checkout: "new-branch" | "current-branch" }
/** A source location cited by an investigation. `step` is the index of the plan step that changes it; null for context that explains but is not changed. */
export interface InvestigationLocation { path: string; line: number; quote: string; why: string; step: number | null }
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
export interface AgentSessionData {
  providerSessionId: string; backend: string; model: string;
  /** Whether the call that opened this session resumed a provider session. */
  resumed: boolean;
}
/** A rewrite of the stack by a tool the user confirmed (moz-phab adds trailers to every commit): implement accepts `to` as its own tip. Artifact `StackRewrite`, verified. */
export interface StackRewriteData { from: string; to: string; by: string }
