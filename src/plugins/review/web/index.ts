import "./styles.css";
import { plural, type WebPlugin, type NodeKind, type ExportDiff, type SessionState, type TaskRecord } from "../../../web/plugin-api.ts";
import { latestNarrative, reviewSize } from "./graph.ts";
import { latestDiff } from "../shared/diffs.ts";
import { isStaleNotice } from "./notices.ts";
import { ReviewView } from "./ReviewView.tsx";
import { RoundView } from "./RoundView.tsx";
import type { RoundPhaseInput } from "../api.ts";
import { roundLabel } from "../shared/rounds.ts";
import { ChangeNode } from "./nodes/ChangeNode.tsx";
import { ChangeHeaderNode } from "./nodes/ChangeHeaderNode.tsx";
import { HunkNode } from "./nodes/HunkNode.tsx";
import { CommitNode } from "./nodes/CommitNode.tsx";
import { SummaryNode } from "./nodes/SummaryNode.tsx";
import { createElement, type ComponentType } from "react";

const reviewNodeKinds: Record<string, NodeKind> = {
  change: { component: ChangeNode as NodeKind["component"], minimapColor: "var(--kind-change)", size: reviewSize },
  changeHeader: { component: ChangeHeaderNode as NodeKind["component"], minimapColor: "var(--kind-change)", size: reviewSize },
  hunk: { component: HunkNode as NodeKind["component"], minimapColor: "var(--kind-change)", size: reviewSize },
  commit: { component: CommitNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: reviewSize },
  summary: { component: SummaryNode as NodeKind["component"], minimapColor: "var(--kind-summary)", size: reviewSize },
};

function exportDiff(state: SessionState): ExportDiff | null {
  const diff = latestDiff(state.artifacts);
  return diff ? { id: diff.id, commits: diff.data.commits.map((commit) => commit.sha), files: diff.data.files.filter((file) => (file.status === "modified" || file.status === "renamed") && !file.binary).map((file) => file.path) } : null;
}

const ReviewTaskBadge: ComponentType<{ task: TaskRecord }> = ({ task }) => {
  if (task.status !== "succeeded") return null;
  const errors = (task.output as { findingErrors?: string[] } | null)?.findingErrors ?? [];
  return errors.length > 0 ? createElement("span", { className: "dropped", title: errors.join("\n") }, ` · ${errors.length} findings dropped`) : null;
};

export const reviewWeb: WebPlugin = {
  id: "review",
  phaseViews: { review: { Body: ReviewView, commentsOnSelection: true, exportable: (state) => !!latestNarrative(state), exportDiff, exportTasks: (task) => task.kind === "resolveSpecRefs" && task.status === "succeeded", exportSummary: (state) => {
    const count = (type: string) => state.artifacts.filter((artifact) => artifact.type === type).length;
    const posted = new Set(state.artifacts.filter((artifact) => artifact.type === "PostedComment").map((artifact) => (artifact.data as { comment: string }).comment));
    const drafts = state.artifacts.filter((artifact) => artifact.type === "ReviewComment" && !posted.has(artifact.id)).length;
    return [`${plural(count("ReviewFinding"), "finding")}, ${plural(drafts, "unposted draft comment")}`];
  }, isStaleNotice: (state, notice) => isStaleNotice(notice, latestDiff(state.artifacts)) }, round: { Body: RoundView, commentsOnSelection: false, chipLabel: (epoch) => roundLabel((epoch.input as RoundPhaseInput).round) } },
  taskLabels: { narrate: "analyze", importDiff: "read patch", importRevision: "fetch revision" },
  taskBadges: { review: ReviewTaskBadge },
  workflowPhase: { review: "review" },
  nodeKinds: reviewNodeKinds,
};
