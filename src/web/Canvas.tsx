import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, Controls, Panel, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow,
  type Edge, type Node, type Viewport,
} from "@xyflow/react";
import type { SessionState } from "../shared/types.ts";
import { estimateSize, layout, placeSatellites, sessionGraph, NODE_WIDTH, zoomLevel, type ZoomLevel } from "./graph.ts";
import { ChangeNode } from "./nodes/ChangeNode.tsx";
import { SummaryNode } from "./nodes/SummaryNode.tsx";
import { SpecNode } from "./nodes/SpecNode.tsx";
import { SourceBaseContext } from "./DiffView.tsx";

const nodeTypes = { change: ChangeNode, summary: SummaryNode, spec: SpecNode };

interface Props { state: SessionState }

export function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ state }: Props) {
  const rf = useReactFlow();
  const container = useRef<HTMLDivElement>(null);
  const graph = useMemo(() => sessionGraph(state), [state]);
  const graphNodes = graph?.nodes ?? [];
  const graphEdges = graph?.edges ?? [];
  const edges = useMemo<Edge[]>(() => graphEdges.map((e) => ({ ...e, type: graphNodes.find((n) => n.id === e.source)?.data.kind === "spec" ? "straight" : "smoothstep", style: graphNodes.find((n) => n.id === e.source)?.data.kind === "spec" ? { strokeDasharray: "4 4" } : undefined })), [graphEdges, graphNodes]);
  const [level, setLevel] = useState<ZoomLevel>("concept");
  const levelRef = useRef(level);
  levelRef.current = level;
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const anchor = useRef<string | null>(null);
  const laidOutKey = useRef("");
  const offsets = useRef(new Map<string, { dx: number; dy: number }>());
  const basePos = useRef(new Map<string, { x: number; y: number }>());

  const place = (id: string, p: { x: number; y: number }) => {
    const o = offsets.current.get(id);
    return o ? { x: p.x + o.dx, y: p.y + o.dy } : p;
  };

  useEffect(() => offsets.current.clear(), [graph]);

  const arrange = (sized: { id: string; width: number; height: number; data: typeof graphNodes[number]["data"] }[]) => {
    const main = sized.filter((n) => n.data.kind !== "spec");
    const mainIds = new Set(main.map((n) => n.id));
    const mainEdges = graphEdges.filter((e) => mainIds.has(e.source) && mainIds.has(e.target));
    const mainPos = layout(main, mainEdges);
    const rects = new Map(main.map((n) => [n.id, { ...mainPos.get(n.id)!, width: n.width, height: n.height }]));
    const satellites = sized.filter((n) => n.data.kind === "spec").map((n) => ({ id: n.id, width: n.width, height: n.height, anchors: graphNodes.find((g) => g.id === n.id)?.anchors ?? [] }));
    return new Map([...mainPos, ...placeSatellites(rects, satellites)]);
  };

  useEffect(() => {
    if (!graph) { setNodes([]); return; }
    const sized = graph.nodes.map((n) => ({ id: n.id, data: n.data, ...estimateSize(n.data, level) }));
    const pos = arrange(sized);
    basePos.current = pos;
    laidOutKey.current = "";
    setNodes(graph.nodes.map((n) => ({
      id: n.id,
      type: n.data.kind,
      data: { ...n.data, sessionId: state.session.id, level },
      position: place(n.id, pos.get(n.id)!),
      style: { width: n.data.kind === "spec" ? 420 : NODE_WIDTH[level] },
      draggable: true,
      dragHandle: ".title",
    })));
  }, [graph, level, setNodes, state.session.id]);

  const sizeKey = nodes.map((n) => `${n.id}:${n.measured?.width ?? 0}x${n.measured?.height ?? 0}`).join("|");
  useEffect(() => {
    if (!graph || nodes.length === 0 || nodes.some((n) => !n.measured?.height)) return;
    if (sizeKey === laidOutKey.current) return;
    laidOutKey.current = sizeKey;
    const pos = arrange(nodes.map((n) => ({ id: n.id, data: n.data as unknown as typeof graphNodes[number]["data"], width: n.measured!.width!, height: n.measured!.height! })));
    basePos.current = pos;
    setNodes((ns) => ns.map((n) => ({ ...n, position: place(n.id, pos.get(n.id)!) })));
    const a = anchor.current && nodes.find((n) => n.id === anchor.current);
    if (a) {
      const p = place(a.id, pos.get(a.id)!);
      rf.setCenter(p.x + a.measured!.width! / 2, p.y + a.measured!.height! / 2, { zoom: rf.getZoom() });
      anchor.current = null;
    }
  }, [sizeKey, nodes, graphEdges, rf, setNodes, graph]);

  const nodeNearestCenter = useCallback((): string | null => {
    const el = container.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const c = rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    let best: string | null = null;
    let bestD = Infinity;
    for (const n of rf.getNodes()) {
      const w = n.measured?.width ?? 0, h = n.measured?.height ?? 0;
      const d = Math.hypot(n.position.x + w / 2 - c.x, n.position.y + h / 2 - c.y);
      if (d < bestD) { bestD = d; best = n.id; }
    }
    return best;
  }, [rf]);

  const onMove = useCallback((_: unknown, vp: Viewport) => {
    const next = zoomLevel(vp.zoom);
    if (next !== levelRef.current) {
      anchor.current = nodeNearestCenter();
      setLevel(next);
    }
  }, [nodeNearestCenter]);

  const reset = () => {
    offsets.current.clear();
    setNodes((ns) => ns.map((n) => {
      const p = basePos.current.get(n.id);
      return p ? { ...n, position: p } : n;
    }));
  };

  return (
    <SourceBaseContext.Provider value={state.sourceBase}><div ref={container} className="canvas" style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onMove={onMove}
        onInit={(inst) => setLevel(zoomLevel(inst.getZoom()))}
        nodesDraggable
        nodesConnectable={false}
        onNodeDragStop={(_, node) => {
          const b = basePos.current.get(node.id)!;
          offsets.current.set(node.id, { dx: node.position.x - b.x, dy: node.position.y - b.y });
        }}
        onlyRenderVisibleElements
        fitView
        minZoom={0.1}
        maxZoom={2}
      >
        <Background />
        <Controls showInteractive={false} />
        <Panel position="top-right"><button onClick={reset}>Reset layout</button></Panel>
      </ReactFlow>
    </div></SourceBaseContext.Provider>
  );
}
