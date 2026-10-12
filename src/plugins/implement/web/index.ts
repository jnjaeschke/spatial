import type { NodeKind, WebPlugin } from "../../../web/plugin-api.ts";
import { MemoryNoticeItem, SteerItem } from "./ConversationItems.tsx";
import { investigationSize } from "./graph.ts";
import { InvestigateView } from "./InvestigateView.tsx";
import { ImplementView } from "./ImplementView.tsx";
import { ReviewerCommentsView } from "./ReviewerCommentsView.tsx";
import { InvestigationNode } from "./nodes/InvestigationNode.tsx";
import { InvestigationQuestionsNode } from "./nodes/InvestigationQuestionsNode.tsx";
import { InvestigationStepNode } from "./nodes/InvestigationStepNode.tsx";
import { InvestigationTestsNode } from "./nodes/InvestigationTestsNode.tsx";
import { LocationNode } from "./nodes/LocationNode.tsx";
import { MemoriesPanel } from "./MemoriesPanel.tsx";

export const implementWeb: WebPlugin = {
  id: "implement",
  phaseViews: { investigate: { Body: InvestigateView }, implement: { Body: ImplementView }, reviewerComments: { Body: ReviewerCommentsView } },
  workflowPhase: { implement: "investigate" },
  conversationItems: { Steer: SteerItem, MemoryNotice: MemoryNoticeItem },
  repoPanels: [MemoriesPanel],
  nodeKinds: {
    investigation: { component: InvestigationNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: investigationSize },
    "investigation-step": { component: InvestigationStepNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: investigationSize },
    "investigation-tests": { component: InvestigationTestsNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: investigationSize },
    "investigation-questions": { component: InvestigationQuestionsNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: investigationSize },
    location: { component: LocationNode as NodeKind["component"], minimapColor: "var(--kind-spec)", size: investigationSize },
  },
};
