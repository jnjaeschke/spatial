import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { type Artifact, type CanvasModel, type CanvasProviderProps, type DiagramData, type SequenceStep, SearchfoxContext, api, searchfoxLinks } from "../../../web/plugin-api.ts";
import { LAYERS, changeLayoutEdges, diagramLayoutEdges, diagramStepTarget, focusLabel, guideEntries, findingsOf, isReviewKind, latestNarrative, layerGraph, minimapMarks, reviewGraph, reviewIsEmpty, reviewPlaces, stackLayout, type Layer } from "./graph.ts";
import type { HunkRow } from "../../../web/plugin-api.ts";
import { InlineStatesContext } from "./inline-state.ts";

/** Holds the canvas's reveal function so panels outside the canvas can reveal nodes in it. */
export const RevealContext = createContext<MutableRefObject<((nodeId: string, collapseId: string) => void) | null> | null>(null);
/** The latest request to jump to a diff row, provided by the review view around its canvas. */
export const JumpContext = createContext<HunkRow | null>(null);

/** Where a verified sequence step's citation sits in the rendered diff, and revealing it. */
export const DiagramStepContext = createContext<{
  stepTarget(diagram: Artifact<DiagramData>, step: SequenceStep): ReturnType<typeof diagramStepTarget>;
  revealStep(nodeId: string, hunkId: string, row: { side: "new" | "old"; line: number }): void;
} | null>(null);

const LAYER_LABEL: Record<Layer, string> = { spec: "Specs", review: "AI review", phab: "Phabricator" };

function ReviewCanvasProvider({ state, graph, readOnly, reveal, focusRow, children }: CanvasProviderProps) {
  const setInline = useContext(InlineStatesContext)?.set;
  const revealer = useContext(RevealContext);
  useEffect(() => { if (revealer) revealer.current = reveal; });
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
  useEffect(() => {
    if (!setInline) return;
    const click = (event: MouseEvent) => {
      const hits = CSS.highlights.highlightsFromPoint(event.clientX, event.clientY);
      const findingRanges = hits.filter((hit) => hit.highlight === CSS.highlights.get("finding-quote")).flatMap((hit) => hit.ranges);
      for (const range of findingRanges) {
        for (const node of graph.nodes) {
          const finding = findingsOf(node.data).find((item) => item.quote === range.toString());
          if (finding) { setInline(finding.findingId, "expanded"); return; }
        }
      }
      const ranges = hits.filter((hit) => hit.highlight === CSS.highlights.get("chat-quote")).flatMap((hit) => hit.ranges);
      if (!ranges.length) return;
      const quote = ranges.map((range) => range.toString()).join("");
      for (const node of graph.nodes) {
        if (!("threads" in node.data) || !Array.isArray(node.data.threads)) continue;
        const thread = node.data.threads.find((item) => item.quote === quote);
        if (thread) { setInline(thread.threadId ?? thread.draftId!, "expanded"); return; }
      }
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [setInline, graph]);
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
