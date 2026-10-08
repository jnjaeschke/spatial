/** What plugins that declare `dependsOn: ["review"]` may import. */
export { nearestFork, defaultReviewRange } from "./workflow/review-range.ts";
export { verifyDiagramAtBase, diagramSchema } from "./runtime/diagram-chat.ts";
export { lookupSpec, specReferenceData, resolveSpecReference, type SpecLookup } from "./runtime/spec-ref.ts";
export { findingStates } from "./shared/findings.ts";
export type { FindingState, FindingStatus } from "./shared/findings.ts";
export type { ReviewFindingData, FindingDecisionData, FindingVerdictData, SpecReferenceData } from "./shared/types.ts";
export type { ReviewPhaseInput } from "./workflow/review.ts";
