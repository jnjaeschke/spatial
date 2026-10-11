import type { WebPlugin, NodeKind, ExportDiff, SessionState } from "../../../web/plugin-api.ts";
import { latestNarrative, reviewSize } from "./graph.ts";
import { latestDiff } from "../shared/diffs.ts";
import { isStaleNotice } from "./notices.ts";
import { ReviewView } from "./ReviewView.tsx";
import { ChangeNode } from "./nodes/ChangeNode.tsx";
import { ChangeHeaderNode } from "./nodes/ChangeHeaderNode.tsx";
import { HunkNode } from "./nodes/HunkNode.tsx";
import { CommitNode } from "./nodes/CommitNode.tsx";
import { SummaryNode } from "./nodes/SummaryNode.tsx";
import { DiagramNode } from "./nodes/DiagramNode.tsx";

const reviewNodeKinds: Record<string, NodeKind> = {
  change: { component: ChangeNode as NodeKind["component"], minimapColor: "var(--kind-change)", size: reviewSize },
  changeHeader: { component: ChangeHeaderNode as NodeKind["component"], minimapColor: "var(--kind-change)", size: reviewSize },
  hunk: { component: HunkNode as NodeKind["component"], minimapColor: "var(--kind-change)", size: reviewSize },
  commit: { component: CommitNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: reviewSize },
  summary: { component: SummaryNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: reviewSize },
  diagram: { component: DiagramNode as NodeKind["component"], minimapColor: "var(--kind-diagram)", size: reviewSize, resizable: true },
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
