import { definePlugin } from "../../plugin-api.ts";
import { artifactKinds, searchKinds } from "./runtime/kinds.ts";
import { exploreWorkflow, explorePhase } from "./workflow/explore.ts";
import { loadSpecAlgorithm } from "./tasks/load-spec-algorithm/task.ts";
import { searchSpecs } from "./tasks/search-specs/task.ts";
import { loadEffectPath } from "./tasks/load-effect-path/task.ts";
import { summarizeAlgorithm } from "./tasks/summarize-algorithm/task.ts";
import { verifySummary } from "./tasks/verify-summary/task.ts";
import { specRoutes } from "./server/routes.ts";
import { specExploreField } from "./runtime/explore-field.ts";
import { mapEngine } from "./tasks/map-engine/task.ts";
import { findImplementation } from "./tasks/find-implementation/task.ts";
import { alignSteps } from "./tasks/align-steps/task.ts";
import { compareEngines } from "./tasks/compare-engines/task.ts";
import { verifyComparison } from "./tasks/verify-comparison/task.ts";

/** Web spec exploration: spec references, algorithms, traces and summaries. */
export const specPlugin = definePlugin({ id: "spec", workflows: [exploreWorkflow], phases: [explorePhase], tasks: [loadSpecAlgorithm, searchSpecs, loadEffectPath, summarizeAlgorithm, verifySummary, mapEngine, findImplementation, alignSteps, compareEngines, verifyComparison], artifactKinds, searchKinds, chatReplyFields: [specExploreField], server: (rt) => ({ routes: specRoutes(rt) }) });
