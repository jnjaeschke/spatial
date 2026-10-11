import { definePlugin } from "../../plugin-api.ts";
import { artifactKinds, searchKinds } from "./runtime/kinds.ts";
import { exploreWorkflow, explorePhase } from "./workflow/explore.ts";
import { loadSpecAlgorithm } from "./tasks/load-spec-algorithm/task.ts";
import { searchSpecs } from "./tasks/search-specs/task.ts";
import { specRoutes } from "./server/routes.ts";

/** Web spec exploration: spec references, algorithms, traces and summaries. */
export const specPlugin = definePlugin({ id: "spec", workflows: [exploreWorkflow], phases: [explorePhase], tasks: [loadSpecAlgorithm, searchSpecs], artifactKinds, searchKinds, server: (rt) => ({ routes: specRoutes(rt) }) });
