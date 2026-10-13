/** What plugins that declare `dependsOn: ["spec"]` may import. */
export type { SpecReferenceData, StepLinkKind, LineRange, StepLink, UnmappedReason, UnmappedLines, SpecStepMapData } from "./shared/types.ts";
export { lookupSpec, specReferenceData, resolveSpecReference, type SpecLookup } from "./runtime/spec-ref.ts";
export { parseSteps, type SpecStep } from "./shared/steps.ts";
export { stepComments, commentBlock, misplacedStepComment, checkStepComment, type StepProblem } from "./runtime/step-check.ts";
export { storedMapping } from "./runtime/mappings.ts";
export type { EngineMapping, EngineSite, EngineStep, EngineTest } from "./shared/types.ts";
export { specServices, type SpecServices } from "./runtime/services.ts";
export type { ResolvedSpec } from "./shared/types.ts";
export type { SearchfoxCapability } from "./runtime/searchfox.ts";
export type { StepCommentCheck, WebspecCapability } from "./runtime/webspec.ts";
