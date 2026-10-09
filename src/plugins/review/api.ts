/** What plugins that declare `dependsOn: ["review"]` may import. */
export { nearestFork, defaultReviewRange } from "./workflow/review-range.ts";
export { verifyDiagramAtBase, diagramSchema } from "./runtime/diagram-chat.ts";
export { lookupSpec, specReferenceData, resolveSpecReference, type SpecLookup } from "./runtime/spec-ref.ts";
export { findingStates } from "./shared/findings.ts";
export type { FindingState, FindingStatus } from "./shared/findings.ts";
export type { ReviewFindingData, FindingDecisionData, FindingVerdictData, SpecReferenceData, PhabCommentData, PostedReplyData } from "./shared/types.ts";
export { postInlineReplies } from "./runtime/post-replies.ts";
export type { ReviewPhaseInput } from "./workflow/review.ts";
export { commitRevision } from "./shared/phabricator.ts";
export type { PhabRevision } from "./shared/phabricator.ts";
