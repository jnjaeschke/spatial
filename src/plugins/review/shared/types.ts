import type { ChatThreadData, DiffFile, Id, Ref } from "../../../plugin-api.ts";
import type { LineRange } from "../../spec/api.ts";

/** Data of a `ReviewFinding` artifact; linked `derivedFrom → narrative` and `about → anchor`. `anchor`, `quote`, `lines` mean the same as on `ChatThreadData`. */
export interface ReviewFindingData {
  anchor: Ref;
  quote?: string;
  lines?: ChatThreadData["lines"];
  category: "correctness" | "spec" | "tests" | "style";
  severity: "high" | "medium" | "low";
  title: string;
  body: string;
}

/** Latest artifact of this type for a finding wins. Linked `about → findingId`. Provenance: user. */
export interface FindingDecisionData { finding: Id; decision: "accepted" | "dismissed" }

/** Where a finding sits in the Diff `toDiff` after re-anchoring; `hunkId` null means the code is gone. Linked `about → finding`; latest per (finding, toDiff) wins. Verified; no LLM. */
export interface FindingCarryData { finding: Id; toDiff: Id; hunkId: string | null; lines?: ChatThreadData["lines"] }

export type FindingVerdictValue = "addressed" | "partially" | "not_addressed";

/** The review's judgement whether a new revision addresses a prior finding. Linked `about → finding`, `derivedFrom → narrative`; latest per finding wins. Provenance: llm. */
export interface FindingVerdictData { finding: Id; verdict: FindingVerdictValue; reason: string }

/** First version from the `comment` task; reviewer edits create a verified version. Linked `about → findingId`. */
export interface ReviewCommentData { finding: Id; body: string }

/** A user's inline comment on one side of a Diff. Later versions link back to the first artifact id. `replyTo` is the first artifact id of the `PhabComment` it answers; it is posted as an inline on `lines` like any other comment. */
export interface UserCommentData { diffId: Id; lines: LineRange; body: string; replaces: Id | null; deleted: boolean; replyTo: Id | null }

/** The user's general review comment for a Phabricator revision. */
export interface ReviewDraftData { revision: number; body: string }

/** A reply to a Phabricator thread drafted by the `draftPhabReply` task from the thread's chat (status proposed). Linked `about → anchor`, the thread's first comment artifact. */
export interface SuggestedReplyData { anchor: Id; body: string }

/** Receipt for a submitted Phabricator review. */
export interface ReviewSubmissionData { revision: number; action: "comment" | "accept" | "request-changes"; body: string; inlines: number }

export interface ReviewPostedCommentData { comment: Id; source: Id; revision: number; diff: number; inlineId: number }

/** The Phabricator diff matching a local Diff while it was the session head, and the revision's newest diff. */
export interface PhabSyncData { revision: number; matchingDiffId: number | null; latestDiffId: number | null; localDiff: Id }

/** A comment imported from Phabricator. Provenance is runtime verified; a newer version or done state revises the prior artifact. `bot` is set when the username ends in "bot": Phabricator roles do not distinguish bots. */
export interface PhabCommentData {
  revision: number; phid: string; version: number; author: string; bot: boolean; /** Whether the author is the user whose Conduit token spatial uses. */ byMe: boolean; body: string; path?: string; line?: number; length?: number; /** Text of the commented line in the raw diff of `diffId`; absent when not found. */ quote?: string;
  diffId?: number; isNewFile?: boolean; replyTo?: string; own: boolean; done: boolean; txId: number; dateCreated: number;
}

/** Data of a `PhabThreadSummary` artifact: an LLM summary of one Phabricator thread (status proposed), keyed by its root comment and the comments it covered. */
export interface PhabThreadSummaryData { revision: number; rootPhid: string; commentPhids: string[]; summary: string }

/** Receipt for a draft inline created on a Phabricator revision. Linked `about → comment`. */
export interface PostedReplyData { comment: Id; body: string; revision: number; diff: number; inlineId: number }

/** Data of an `Interdiff` artifact: what the author changed between two revisions, without changes that only come from rebasing. Linked `about → toDiff`. Produced by the `interdiff` task; verified; no LLM. `conflicts` lists paths where replaying the old patch onto the new base conflicted; for those, `files` holds a per-file comparison of the old and new patch hunks instead. */
export interface InterdiffData { fromDiff: Id; toDiff: Id; files: DiffFile[]; conflicts: string[] }

/** Data of an `IntroducedSymbols` artifact: identifiers the diff adds that occur nowhere in the base tree, by name, with the added line that defines them. */
export interface IntroducedSymbolsData {
  diffId: Id;
  symbols: Record<string, { sites: { path: string; hunkId: string; line: number; commit: number; kind: "declaration" | "definition" }[] }>;
}

/** A reviewer's mark on a change of a narrative; the latest per (narrative, change) wins. Linked `about → <narrative>#<change>`. Provenance: user. */
export interface ChangeReviewData { narrative: Id; change: string; reviewed: boolean }
export interface BugReportData { bug: number; title: string; status: string; component: string; markdown: string; error: string | null }
export interface BugSummaryData { bug: number; summary: string }
