/** Web parts of the spec plugin that plugins declaring `dependsOn: ["spec"]` may import. */
export { parseSteps, type SpecStep } from "../shared/steps.ts";
export type { SpecReferenceData, LineRange, StepLink, StepLinkKind, UnmappedLines, UnmappedReason, SpecStepMapData } from "../shared/types.ts";
export { SpecLinkContext, SpecMarkdown } from "./SpecMarkdown.tsx";
