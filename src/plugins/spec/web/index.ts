import type { WebPlugin } from "../../../web/plugin-api.ts";
import type { NodeKind } from "../../../web/plugin-api.ts";
import { algorithmSize } from "./graph.ts";
import { AlgorithmNode } from "./AlgorithmNode.tsx";
import { ExplorerView } from "./ExplorerView.tsx";

export const specWeb: WebPlugin = {
  id: "spec",
  phaseViews: { explore: { Body: ExplorerView } },
  workflowPhase: { explore: "explore" },
  nodeKinds: { "spec-algorithm": { component: AlgorithmNode as NodeKind["component"], minimapColor: "var(--kind-spec)", size: algorithmSize } },
};
