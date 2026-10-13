import { createContext, useContext, useEffect, type MutableRefObject } from "react";
import { type CanvasModel, type CanvasProviderProps, DiagramStepContext, api } from "../../../web/plugin-api.ts";
import { LAYERS, changeLayoutEdges, diagramLayoutEdges, diagramStepTarget, focusLabel, guideEntries, findingsOf, isReviewKind, layerGraph, minimapMarks, reviewGraph, reviewIsEmpty, reviewPlaces, stackLayout, type Layer } from "./graph.ts";
import type { HunkRow } from "../../../web/plugin-api.ts";
import { InlineStatesContext } from "../../../web/plugin-api.ts";

/** Holds the canvas's reveal function so panels outside the canvas can reveal nodes in it. */
export const RevealContext = createContext<MutableRefObject<((nodeId: string, collapseId: string) => void) | null> | null>(null);
/** The latest request to jump to a diff row, provided by the review view around its canvas. */
export const JumpContext = createContext<HunkRow | null>(null);

const LAYER_LABEL: Record<Layer, string> = { spec: "Specs", review: "AI review", phab: "Phabricator" };

function ReviewCanvasProvider({ graph, reveal, focusRow, children }: CanvasProviderProps) {
  const revealer = useContext(RevealContext);
  useEffect(() => { if (revealer) revealer.current = reveal; });
  const jump = useContext(JumpContext);
  const revealStep = (nodeId: string, hunkId: string, row: { side: "new" | "old"; line: number }) => {
    const node = graph.nodes.find((item) => item.id === nodeId);
    if (!node || !isReviewKind(node.data, "change")) return;
    reveal(nodeId, `${node.data.narrativeId}#${node.data.change.id}`, `change:${node.data.change.id}`);
    focusRow({ anchor: `${node.data.diffId}#${hunkId}`, ...row });
  };
  useEffect(() => {
    if (!jump) return;
    const change = graph.nodes.find((node) => isReviewKind(node.data, "change") && node.data.hunks.some(({ hunk }) => hunk.id === jump.hunkId));
    if (change) revealStep(change.id, jump.hunkId, { side: jump.side, line: jump.line });
    // Only a new request jumps; graph updates must not re-reveal.
  }, [jump]);
  return <DiagramStepContext.Provider value={{ onStep: (diagram, step) => { const target = diagramStepTarget(graph.nodes, diagram, step); return target ? () => revealStep(target.changeNodeId, target.hunkId, target.row) : null; } }}>{children}</DiagramStepContext.Provider>;
}

function CompactToggle() {
  const inline = useContext(InlineStatesContext);
  return inline && <button type="button" aria-pressed={inline.compact} onClick={() => inline.setCompact(!inline.compact)}>Compact</button>;
}

export const reviewCanvas: CanvasModel = {
  graph: reviewGraph,
  collapsedByDefault: (graph) => graph.nodes.flatMap((n) => isReviewKind(n.data, "summary") ? [
        ...n.data.reviews.filter(reviewIsEmpty).map((review) => `review:${review.revision}`),
      ] : []),
  guide: (graph, place) => guideEntries(graph, place).map(({ change, ...step }) => ({
    ...step,
    ...(change ? { toggleReviewed: (sessionId: string) => api.setReviewed(sessionId, change.narrativeId, change.change.id, !change.reviewed) } : {}),
  })),
  layers: { list: LAYERS.map((id) => ({ id, label: LAYER_LABEL[id] })), hide: (graph, hidden) => layerGraph(graph, hidden as ReadonlySet<Layer>) },
  places: reviewPlaces,
  focusLabel,
  stack: { is: (_, place) => place === "stack", layout: stackLayout },
  layoutEdges: (nodes, edges) => changeLayoutEdges(nodes, diagramLayoutEdges(nodes, edges)),
  quotes: (data) => findingsOf(data).flatMap((finding) => finding.quote ? [{ id: finding.findingId, kind: "finding", anchor: finding.anchor, quote: finding.quote, lines: finding.lines }] : []),
  minimapMarks,
  revealWhenAdded: (node) => node.data.kind === "diagram",
  PanelExtras: CompactToggle,
  Provider: ReviewCanvasProvider,
};
