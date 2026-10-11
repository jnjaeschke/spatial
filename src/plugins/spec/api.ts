/** What plugins that declare `dependsOn: ["spec"]` may import. */
export type { SpecReferenceData, StepLinkKind, LineRange, StepLink, UnmappedReason, UnmappedLines, SpecStepMapData } from "./shared/types.ts";
export { lookupSpec, specReferenceData, resolveSpecReference, type SpecLookup } from "./runtime/spec-ref.ts";
