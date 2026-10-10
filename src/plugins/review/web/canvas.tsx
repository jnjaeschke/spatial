import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { PhabCommentData } from "../shared/types.ts";
import { type Artifact, type CanvasModel, type CanvasProviderProps, type DiagramData, type SequenceStep, SearchfoxContext, api, searchfoxLinks } from "../../../web/plugin-api.ts";
import { LAYERS, changeLayoutEdges, diagramLayoutEdges, diagramStepTarget, guideEntries, isReviewKind, latestNarrative, layerGraph, phabCommentCollapseId, reviewGraph, reviewIsEmpty, reviewPlaces, stackLayout, type Layer } from "./graph.ts";

/** A diff row to reveal and focus; a new object per request. */
import type { HunkRow } from "../../../web/plugin-api.ts";
/** The latest request to jump to a diff row, provided by the review view around its canvas. */
export const JumpContext = createContext<HunkRow | null>(null);

/** Where a verified sequence step's citation sits in the rendered diff, and revealing it. */
export const DiagramStepContext = createContext<{
  stepTarget(diagram: Artifact<DiagramData>, step: SequenceStep): ReturnType<typeof diagramStepTarget>;
  revealStep(nodeId: string, hunkId: string, row: { side: "new" | "old"; line: number }): void;
} | null>(null);

const botCommentIds = (comments: Artifact<PhabCommentData>[], anchors: Record<string, string>) => comments.filter((comment) => comment.data.bot).map((comment) => phabCommentCollapseId(anchors[comment.data.phid]!));

const LAYER_LABEL: Record<Layer, string> = { spec: "Specs", review: "AI review", phab: "Phabricator" };

function ReviewCanvasProvider({ state, graph, readOnly, reveal, focusRow, children }: CanvasProviderProps) {
  const [resolvedLinks, setResolvedLinks] = useState<Record<string, string | null>>({});
  const requested = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  const scheduled = useRef(false);
  const request = useCallback((token: string) => {
    if (readOnly || requested.current.has(token)) return;
    requested.current.add(token);
    pending.current.add(token);
    if (scheduled.current) return;
    scheduled.current = true;
    queueMicrotask(() => {
      scheduled.current = false;
      const tokens = [...pending.current];
      pending.current.clear();
      void api.codeLinks(state.session.id, tokens).then(({ links }) => setResolvedLinks((current) => ({ ...current, ...links })), (error: unknown) => console.error(error));
    });
  }, [state.session.id, readOnly]);
  const searchfox = useMemo(() => {
    const latest = latestNarrative(state);
    const links = latest ? searchfoxLinks(state, latest.diff.data, request) : null;
    return links ? { ...links, links: { ...links.links, ...resolvedLinks } } : null;
  }, [state, request, resolvedLinks]);
  const jump = useContext(JumpContext);
  const revealStep = (nodeId: string, hunkId: string, row: { side: "new" | "old"; line: number }) => {
    const node = graph.nodes.find((item) => item.id === nodeId);
    if (!node || !isReviewKind(node.data, "change")) return;
    reveal(nodeId, `${node.data.narrativeId}#${node.data.change.id}`, `change:${nodeId}`);
    focusRow({ anchor: `${node.data.diffId}#${hunkId}`, ...row });
  };
  useEffect(() => {
    if (!jump) return;
    const change = graph.nodes.find((node) => isReviewKind(node.data, "change") && node.data.hunks.some(({ hunk }) => hunk.id === jump.hunkId));
    if (change) revealStep(change.id, jump.hunkId, { side: jump.side, line: jump.line });
    // Only a new request jumps; graph updates must not re-reveal.
  }, [jump]);
  return <SearchfoxContext.Provider value={searchfox}>
    <DiagramStepContext.Provider value={{ stepTarget: (diagram, step) => diagramStepTarget(graph.nodes, diagram, step), revealStep }}>{children}</DiagramStepContext.Provider>
  </SearchfoxContext.Provider>;
}

export const reviewCanvas: CanvasModel = {
  graph: reviewGraph,
  collapsedByDefault: (graph) => graph.nodes.flatMap((n) => isReviewKind(n.data, "finding") && n.data.collapsedByDefault ? [n.id]
    : isReviewKind(n.data, "phab") ? [...(n.data.done ? [n.id] : []), ...botCommentIds(n.data.comments, n.data.phabAnchors)]
      : isReviewKind(n.data, "summary") ? [
        ...n.data.phabUnanchored.filter((group) => group.outdatedEpoch !== null).map((group) => `phab-outdated:${group.outdatedEpoch}`),
        ...n.data.reviews.filter(reviewIsEmpty).map((review) => `review:${review.revision}`),
        ...botCommentIds([...n.data.phabGeneral, ...n.data.phabUnanchored.flatMap((group) => group.comments)], n.data.phabAnchors),
      ] : []),
  guide: (graph, place) => guideEntries(graph, place).map(({ change, ...step }) => ({
    ...step,
    ...(change ? { toggleReviewed: (sessionId: string) => api.setReviewed(sessionId, change.narrativeId, change.change.id, !change.reviewed) } : {}),
  })),
  layers: { list: LAYERS.map((id) => ({ id, label: LAYER_LABEL[id] })), hide: (graph, hidden) => layerGraph(graph, hidden as ReadonlySet<Layer>) },
  places: reviewPlaces,
  stack: { is: (_, place) => place === "stack", layout: stackLayout },
  layoutEdges: (nodes, edges) => changeLayoutEdges(nodes, diagramLayoutEdges(nodes, edges)),
  revealWhenAdded: (node) => node.data.kind === "diagram",
  Provider: ReviewCanvasProvider,
};
