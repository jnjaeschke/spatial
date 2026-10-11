import { isSatellite, latestStart, lines, placeSatellites, rootGraph, type Draft, type Graph, type GraphEdge, type GraphNode, type GraphNodeData, type PlacedNode } from "../../../web/graph-api.ts";
import type { Artifact, SessionState } from "../../../web/plugin-api.ts";
import type { SpecAlgorithmData, SpecOpenedData, SpecTraceData } from "../shared/types.ts";

/** Node id of the box of a `SPEC#anchor` ref. */
export const specNodeId = (ref: string) => `spec:${ref}`;

/** Data of a `spec-algorithm` node: one open algorithm box, laid out right of `parent`, `order` in open order. */
export type AlgorithmNodeData = { kind: "spec-algorithm"; ref: string; algorithm: Artifact<SpecAlgorithmData>; parent: string; order: number; movable: true; closable: true; reopenOn: string };

/** The open boxes (refs in first-open order): reachable from a root opening over links from open boxes, without the closed ones; and each closed box an open box (or a root opening, null) still leads to, with that host. */
export function openBoxes(opened: SpecOpenedData[], closed: ReadonlySet<string>): { open: string[]; closedHosts: Map<string, string | null> } {
  const reached = new Set<string>();
  const closedHosts = new Map<string, string | null>();
  const visit = (ref: string, host: string | null) => {
    if (reached.has(ref) || closedHosts.has(ref)) return;
    if (closed.has(ref)) { closedHosts.set(ref, host); return; }
    reached.add(ref);
    for (const link of opened) if (link.from?.anchor === ref) visit(link.anchor, ref);
  };
  for (const link of opened) if (link.from === null) visit(link.anchor, null);
  return { open: [...new Set(opened.map((link) => link.anchor))].filter((ref) => reached.has(ref)), closedHosts };
}

/** The explorer canvas: the session conversation as root, a box per open algorithm (closed boxes stay in the graph for core to hide and offer for reopening), link edges labelled with their step, and the hops of `trace` between boxes as numbered edges. `closed` holds closed node ids. */
export function explorerGraph(state: SessionState, drafts: Draft[], closed: ReadonlySet<string>, trace: SpecTraceData | null): Graph | null {
  const start = latestStart(state);
  if (!start) return null;
  const opened = state.artifacts.filter((a) => a.type === "SpecOpened").map((a) => a.data as SpecOpenedData);
  const algorithms = new Map<string, Artifact<SpecAlgorithmData>>();
  for (const a of state.artifacts) if (a.type === "SpecAlgorithm") algorithms.set((a.data as SpecAlgorithmData).ref, a as Artifact<SpecAlgorithmData>);
  const closedRefs = new Set([...closed].filter((id) => id.startsWith("spec:")).map((id) => id.slice("spec:".length)));
  const { open, closedHosts } = openBoxes(opened, closedRefs);
  const openSet = new Set(open);
  const shown = [...open, ...closedHosts.keys()].filter((ref) => algorithms.has(ref));
  const shownSet = new Set(shown);
  const nodes: GraphNode[] = shown.map((ref, order) => {
    const first = opened.find((link) => link.anchor === ref && (link.from === null || openSet.has(link.from.anchor)));
    const parent = first?.from ? specNodeId(first.from.anchor) : start.id;
    const host = closedHosts.get(ref);
    return { id: specNodeId(ref), data: { kind: "spec-algorithm", ref, algorithm: algorithms.get(ref)!, parent, order, movable: true, closable: true, reopenOn: host === undefined ? parent : host === null ? start.id : specNodeId(host) } satisfies AlgorithmNodeData };
  });
  const edges = new Map<string, GraphEdge>();
  for (const link of opened) {
    if (!shownSet.has(link.anchor)) continue;
    const target = specNodeId(link.anchor);
    if (link.from === null) edges.set(`${start.id}->${target}`, { id: `${start.id}->${target}`, source: start.id, target });
    else if (shownSet.has(link.from.anchor)) {
      const id = `${specNodeId(link.from.anchor)}->${target}@${link.from.step}`;
      edges.set(id, { id, source: specNodeId(link.from.anchor), target, ...(link.from.step ? { label: `step ${link.from.step}` } : {}) });
    }
  }
  const entries = trace?.entries ?? [];
  entries.forEach((entry, index) => {
    const next = entries[index + 1];
    if (!next || next.anchor === entry.anchor || !shownSet.has(entry.anchor) || !shownSet.has(next.anchor)) return;
    edges.set(`hop:${index}`, { id: `hop:${index}`, source: specNodeId(entry.anchor), target: specNodeId(next.anchor), label: `${index + 1}`, className: "trace-hop" });
  });
  return rootGraph(state, drafts, { nodes, edges: [...edges.values()] });
}

const GAP_X = 120, GAP_Y = 48;

/** Explorer positions: the conversation at the left, each box right of its parent below what that column already holds, in open order but after its parent; a box whose parent was placed freely starts in the first box column; satellites beside what they hang off. */
export function explorerLayout(nodes: PlacedNode[], _edges: { source: string; target: string }[]): Map<string, { x: number; y: number }> {
  const rects = new Map<string, { x: number; y: number; width: number; height: number }>();
  const bottoms = new Map<number, number>();
  const place = (node: PlacedNode, x: number, y: number) => {
    const top = Math.max(y, (bottoms.get(x) ?? -Infinity) + GAP_Y);
    rects.set(node.id, { x, y: top, width: node.width, height: node.height });
    bottoms.set(x, top + node.height);
  };
  const main = nodes.filter((node) => !isSatellite(node));
  const root = main.find((node) => node.data.kind === "conversation") ?? main[0];
  if (!root) return new Map();
  place(root, 0, 0);
  const boxes = main.filter((node) => node.data.kind === "spec-algorithm").sort((a, b) => (a.data as AlgorithmNodeData).order - (b.data as AlgorithmNodeData).order);
  // A box can be opened before the box that is its parent now (its first link's source was closed), so it waits for that parent.
  const laidOut = new Set(boxes.map((box) => box.id));
  const placeBox = (box: PlacedNode) => {
    if (rects.has(box.id)) return;
    const parentId = (box.data as AlgorithmNodeData).parent;
    const parentBox = laidOut.has(parentId) ? boxes.find((node) => node.id === parentId) : undefined;
    if (parentBox) { laidOut.delete(box.id); placeBox(parentBox); }
    const parent = rects.get(parentId) ?? rects.get(root.id)!;
    place(box, parent.x + parent.width + GAP_X, parent.y);
  };
  for (const box of boxes) placeBox(box);
  for (const node of main) if (!rects.has(node.id)) place(node, 0, 0);
  const out = new Map([...rects].map(([id, rect]) => [id, { x: rect.x, y: rect.y }]));
  const satellites = nodes.filter(isSatellite).map((node) => ({ id: node.id, width: node.width, height: node.height, anchors: node.anchors ?? [] }));
  for (const [id, position] of placeSatellites(rects, satellites)) out.set(id, position);
  return out;
}

/** First-paint size of an algorithm box; steps scroll inside a body of at most 560 px. */
export function algorithmSize(data: GraphNodeData): { width: number; height: number } {
  return { width: 560, height: 90 + Math.min(560, lines((data as AlgorithmNodeData).algorithm.data.content, 80) * 20) };
}
