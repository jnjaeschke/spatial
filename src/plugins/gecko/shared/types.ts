import type { Id, LlmSelection } from "../../../plugin-api.ts";

/** Input of the `try` phase: from the implement workflow after Accept (the LLM proposes from `base..head`), or from chat with the proposal already made. */
export type TryInput = { base: string; head: string; llm?: LlmSelection } | { head: string; proposal: TryProposalData };
/** The LLM's proposed try command (artifact `TryProposal`, proposed). */
export interface TryProposalData { command: string; reason: string }
/** Input of the `tryPush` phase: the command the user confirmed and the tip it must push. */
export interface TryPushInput { command: string; head: string; proposalId: Id }
/** A push to try (artifact `TryPush`, verified): what ran, which tip, and the Treeherder link `treeherder-cli` reads. */
export interface TryPushData { command: string; url: string; head: string }
/** One failing try job and its error lines. */
export interface TryFailure { jobId: number; name: string; platform: string; result: string; errors: { test: string | null; message: string }[] }
/** One observed state of a push (artifact `TryRun`, verified), stored only when it changed. `counts` are Treeherder's job state counts; `error` is set when Treeherder could not be read. */
export interface TryRunData { push: Id; url: string; revision: string | null; pushId: number | null; counts: Record<string, number>; complete: boolean; failures: TryFailure[]; error: string | null }
/** Input of the `submit` phase: the stack `base..head` to submit. */
export interface SubmitInput { base: string; head: string }
/** Reviewers suggested for the changed files (artifact `ReviewerSuggestion`, verified). */
export interface ReviewerSuggestionData { files: string[]; commits: number; suggested: string[]; candidates: { name: string; count: number }[]; error: string | null }
/** Input of the `phabSubmit` phase: what the user confirmed. */
export interface PhabSubmitInput { base: string; head: string; reviewers: string; wip: boolean }
