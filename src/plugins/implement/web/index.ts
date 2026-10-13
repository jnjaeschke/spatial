import "./styles.css";
import type { NodeKind, WebPlugin } from "../../../web/plugin-api.ts";
import { MemoryNoticeItem, SteerItem } from "./ConversationItems.tsx";
import { investigationSize } from "./graph.ts";
import { InvestigateView } from "./InvestigateView.tsx";
import { ImplementView } from "./ImplementView.tsx";
import { AdoptView } from "./AdoptView.tsx";
import { ReviewerCommentsView } from "./ReviewerCommentsView.tsx";
import { InvestigationNode } from "./nodes/InvestigationNode.tsx";
import { InvestigationQuestionsNode } from "./nodes/InvestigationQuestionsNode.tsx";
import { InvestigationStepNode } from "./nodes/InvestigationStepNode.tsx";
import { InvestigationTestsNode } from "./nodes/InvestigationTestsNode.tsx";
import { LocationNode } from "./nodes/LocationNode.tsx";
import { MemoriesPanel } from "./MemoriesPanel.tsx";
import { implementClient } from "./client.ts";
import type { AdoptRangeInput } from "../shared/types.ts";

export const implementWeb: WebPlugin = {
  id: "implement",
  phaseViews: { investigate: { Body: InvestigateView }, implement: { Body: ImplementView }, reviewerComments: { Body: ReviewerCommentsView }, adopt: { Body: AdoptView, chipLabel: () => "Adopt" }, adoptRange: { Body: AdoptView, chipLabel: (epoch) => `Adopted up to ${(epoch.input as AdoptRangeInput).head.slice(0, 12)}` } },
  workflowPhase: { implement: "investigate" },
  steer: { implement: (sessionId, text, live) => implementClient.steer(sessionId, text, live) },
  conversationItems: { Steer: SteerItem, MemoryNotice: MemoryNoticeItem },
  conversationTasks: ["distillSteer"],
  repoPanels: [MemoriesPanel],
  nodeKinds: {
    investigation: { component: InvestigationNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: investigationSize },
    "investigation-step": { component: InvestigationStepNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: investigationSize },
    "investigation-tests": { component: InvestigationTestsNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: investigationSize },
    "investigation-questions": { component: InvestigationQuestionsNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: investigationSize },
    location: { component: LocationNode as NodeKind["component"], minimapColor: "var(--kind-spec)", size: investigationSize },
  },
};
