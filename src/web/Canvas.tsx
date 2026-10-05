import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, Controls, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow,
  type Edge, type Node, type Viewport,
} from "@xyflow/react";
import type { Artifact, DiffData, PatchNarrativeData } from "../shared/types.ts";
import { estimateSize, layout, narrativeGraph, NODE_WIDTH, zoomLevel, type ZoomLevel } from "./graph.ts";
import { ChangeNode } from "./nodes/ChangeNode.tsx";
import { SummaryNode } from "./nodes/SummaryNode.tsx";

const nodeTypes = { change: ChangeNode, summary: SummaryNode };

interface Props {
  narrative: Artifact<PatchNarrativeData>;
  diff: Artifact<DiffData>;
}

export function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ narrative, diff }: Props) {
  const rf = useReactFlow();
  const container = useRef<HTMLDivElement>(null);
  const graph = useMemo(() => narrativeGraph(narrative, diff), [narrative, diff]);
  const edges = useMemo<Edge[]>(() => graph.edges.map((e) => ({ ...e, type: "smoothstep" })), [graph]);
  const [level, setLevel] = useState<ZoomLevel>("concept");
  const levelRef = useRef(level);
  levelRef.current = level;
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const anchor = useRef<string | null>(null);
  const laidOutKey = useRef("");

  useEffect(() => {
    const sized = graph.nodes.map((n) => ({ id: n.id, ...estimateSize(n.data, level) }));
    const pos = layout(sized, graph.edges);
    laidOutKey.current = "";
    setNodes(graph.nodes.map((n) => ({
      id: n.id,
      type: n.data.kind,
      data: { ...n.data, level },
      position: pos.get(n.id)!,
      style: { width: NODE_WIDTH[level] },
      draggable: false,
    })));
  }, [graph, level, setNodes]);

  const sizeKey = nodes.map((n) => `${n.id}:${n.measured?.width ?? 0}x${n.measured?.height ?? 0}`).join("|");
  useEffect(() => {
    if (nodes.length === 0 || nodes.some((n) => !n.measured?.height)) return;
    if (sizeKey === laidOutKey.current) return;
    laidOutKey.current = sizeKey;
    const pos = layout(nodes.map((n) => ({ id: n.id, width: n.measured!.width!, height: n.measured!.height! })), graph.edges);
    setNodes((ns) => ns.map((n) => ({ ...n, position: pos.get(n.id)! })));
    const a = anchor.current && nodes.find((n) => n.id === anchor.current);
    if (a) {
      const p = pos.get(a.id)!;
      rf.setCenter(p.x + a.measured!.width! / 2, p.y + a.measured!.height! / 2, { zoom: rf.getZoom() });
      anchor.current = null;
    }
  }, [sizeKey, nodes, graph.edges, rf, setNodes]);

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

  return (
    <div ref={container} className="canvas" style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onMove={onMove}
        onInit={(inst) => setLevel(zoomLevel(inst.getZoom()))}
        nodesDraggable={false}
        nodesConnectable={false}
        onlyRenderVisibleElements
        fitView
        minZoom={0.1}
        maxZoom={2}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
