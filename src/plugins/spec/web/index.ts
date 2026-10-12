import type { WebPlugin } from "../../../web/plugin-api.ts";
import type { NodeKind } from "../../../web/plugin-api.ts";
import { algorithmSize } from "./graph.ts";
import { AlgorithmNode } from "./AlgorithmNode.tsx";
import { ExplorerView } from "./ExplorerView.tsx";
import { ExploreButton } from "./ExploreButton.tsx";
import { ImplementationsView } from "./ImplementationsView.tsx";

export const specWeb: WebPlugin = {
  id: "spec",
  phaseViews: { explore: { Body: ExplorerView } },
  sessionViews: [
    { id: "spec", label: "Spec explorer", available: (state) => state.session.workflow !== "explore" && state.artifacts.some((a) => a.type === "SpecOpened"), Body: ExplorerView },
    { id: "impl", label: "Implementations", available: (state) => state.artifacts.some((a) => a.type === "SpecAlgorithm"), Body: ImplementationsView },
  ],
  replyActions: { SpecExploreRequest: ExploreButton },
  workflowPhase: { explore: "explore" },
  nodeKinds: { "spec-algorithm": { component: AlgorithmNode as NodeKind["component"], minimapColor: "var(--kind-spec)", size: algorithmSize } },
};
