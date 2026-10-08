import type { NodeKind, WebPlugin } from "../../../web/plugin-api.ts";
import { investigationSize } from "./graph.ts";
import { InvestigateView } from "./InvestigateView.tsx";
import { ImplementView } from "./ImplementView.tsx";
import { InvestigationNode } from "./nodes/InvestigationNode.tsx";
import { LocationNode } from "./nodes/LocationNode.tsx";

export const implementWeb: WebPlugin = {
  id: "implement",
  phaseViews: { investigate: { Body: InvestigateView }, implement: { Body: ImplementView } },
  workflowPhase: { implement: "investigate" },
  nodeKinds: {
    investigation: { component: InvestigationNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: investigationSize },
    location: { component: LocationNode as NodeKind["component"], minimapColor: "var(--kind-spec)", size: investigationSize },
  },
};
