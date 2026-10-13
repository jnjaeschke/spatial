import { layout, placeSatellites, type GraphEdge, type GraphNode, type Graph, type PlacedNode } from "./graph.ts";

export function nodeWidth(input: { resizable: boolean; defaultWidth: number; storedWidth?: number; satellite: boolean; satelliteWidth: number }): number {
  return input.resizable ? input.storedWidth ?? (input.satellite ? input.satelliteWidth : input.defaultWidth) : input.defaultWidth;
}

export function arrangeCanvas(input: {
  all: { id: string; width: number; height: number }[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  satelliteAnchors: Map<string, string[]>;
  stack?: { is(graph: Graph, place: string | null): boolean; layout(nodes: PlacedNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> };
  graph: Graph;
  place: string | null;
  layoutEdges?: (nodes: GraphNode[], edges: GraphEdge[]) => GraphEdge[];
}): Map<string, { x: number; y: number }> {
  const { all, nodes, edges, satelliteAnchors } = input;
  const free = new Map(nodes.filter((n) => n.position).map((n) => [n.id, n.position!]));
  const rootOf = new Map<string, string>();
  for (let grew = true; grew;) {
    grew = false;
    for (const [id, anchors] of satelliteAnchors) {
      if (rootOf.has(id) || free.has(id) || !anchors.length) continue;
      const root = free.has(anchors[0]!) ? anchors[0]! : rootOf.get(anchors[0]!);
      if (root) { rootOf.set(id, root); grew = true; }
    }
  }
  const freePlaced = new Map<string, { x: number; y: number }>();
  for (const root of new Set(rootOf.values())) {
    const rootSize = all.find((n) => n.id === root)!;
    const rects = new Map([[root, { ...free.get(root)!, width: rootSize.width, height: rootSize.height }]]);
    const satellites = all.filter((n) => rootOf.get(n.id) === root).map((n) => ({ ...n, anchors: satelliteAnchors.get(n.id)!.slice(0, 1) }));
    for (const [id, p] of placeSatellites(rects, satellites)) freePlaced.set(id, p);
  }
  const sized = all.filter((n) => !free.has(n.id) && !rootOf.has(n.id));
  if (input.stack?.is(input.graph, input.place)) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return new Map([...input.stack.layout(sized.map((s) => { const n = byId.get(s.id)!; return { ...s, data: n.data, anchors: n.anchors ?? [] }; }), edges), ...free, ...freePlaced]);
  }
  const main = sized.filter((n) => !satelliteAnchors.has(n.id));
  const mainEdges = edges.filter((e) => !satelliteAnchors.has(e.source));
  const layoutEdges = input.layoutEdges?.(nodes, mainEdges) ?? mainEdges;
  const mainPos = layout(main, layoutEdges);
  const rects = new Map(main.map((n) => [n.id, { ...mainPos.get(n.id)!, width: n.width, height: n.height }]));
  const satellites = sized.filter((n) => satelliteAnchors.has(n.id)).map((n) => ({ ...n, anchors: satelliteAnchors.get(n.id)! }));
  return new Map([...mainPos, ...placeSatellites(rects, satellites), ...free, ...freePlaced]);
}
