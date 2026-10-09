import type { WebPlugin, NodeKind, ExportDiff, SessionState } from "../../../web/plugin-api.ts";
import { latestNarrative, reviewSize } from "./graph.ts";
import { latestDiff } from "../shared/diffs.ts";
import { isStaleNotice } from "./notices.ts";
import { ReviewView } from "./ReviewView.tsx";
import { ChangeNode } from "./nodes/ChangeNode.tsx";
import { CommitNode } from "./nodes/CommitNode.tsx";
import { SummaryNode } from "./nodes/SummaryNode.tsx";
import { SpecNode } from "./nodes/SpecNode.tsx";
import { DiagramNode } from "./nodes/DiagramNode.tsx";
import { FindingNode } from "./nodes/FindingNode.tsx";
import { PhabThreadNode } from "./nodes/PhabThreadNode.tsx";

const reviewNodeKinds: Record<string, NodeKind> = {
  change: { component: ChangeNode as NodeKind["component"], minimapColor: "var(--kind-change)", size: reviewSize },
  commit: { component: CommitNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: reviewSize },
  summary: { component: SummaryNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: reviewSize },
  spec: { component: SpecNode as NodeKind["component"], minimapColor: "var(--kind-spec)", size: reviewSize },
  diagram: { component: DiagramNode as NodeKind["component"], minimapColor: "var(--kind-diagram)", size: reviewSize, resizable: false },
  finding: { component: FindingNode as NodeKind["component"], minimapColor: "var(--kind-finding)", size: reviewSize },
  phab: { component: PhabThreadNode as NodeKind["component"], minimapColor: "var(--kind-phab)", size: reviewSize },
};

function exportDiff(state: SessionState): ExportDiff | null {
  const diff = latestDiff(state.artifacts);
  return diff ? { id: diff.id, commits: diff.data.commits.map((commit) => commit.sha), files: diff.data.files.filter((file) => (file.status === "modified" || file.status === "renamed") && !file.binary).map((file) => file.path) } : null;
}

export const reviewWeb: WebPlugin = {
  id: "review",
  phaseViews: { review: { Body: ReviewView, commentsOnSelection: true, exportable: (state) => !!latestNarrative(state), exportDiff, isStaleNotice: (state, notice) => isStaleNotice(notice, latestDiff(state.artifacts)) } },
  workflowPhase: { review: "review" },
  nodeKinds: reviewNodeKinds,
};
