import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, Controls, Panel, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow,
  type Edge, type Node, type Viewport,
} from "@xyflow/react";
import type { ModelsResponse, Ref, SessionState } from "../shared/types.ts";
import { AskContext, ChatActionsContext } from "./chat-context.ts";
import { estimateSize, layout, placeSatellites, sessionGraph, NODE_WIDTH, SATELLITE_WIDTH, zoomLevel, type ZoomLevel } from "./graph.ts";
import { ChangeNode } from "./nodes/ChangeNode.tsx";
import { SummaryNode } from "./nodes/SummaryNode.tsx";
import { SpecNode } from "./nodes/SpecNode.tsx";
import { SourceBaseContext } from "./DiffView.tsx";
import { ChatNode } from "./nodes/ChatNode.tsx";

const nodeTypes = { change: ChangeNode, summary: SummaryNode, spec: SpecNode, chat: ChatNode };

interface Props { state: SessionState; models?: ModelsResponse | null }

export function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ state, models = null }: Props) {
  const rf = useReactFlow();
  const container = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);
  const [drafts, setDrafts] = useState<{ id: string; anchor: Ref; taskId?: string }[]>([]);
  useEffect(() => {
    const completed = new Set(state.artifacts.filter((a) => a.type === "ChatThread").map((a) => a.provenance.taskId));
    setDrafts((current) => current.filter((d) => !d.taskId || !completed.has(d.taskId)));
  }, [state]);
  const ask = useCallback((ref: Ref) => {
    const id = `draft-${crypto.randomUUID()}`;
    anchor.current = id;
    setDrafts((current) => [...current, { id, anchor: ref }]);
  }, []);
  const onSent = useCallback((draftId: string, taskId: string) => setDrafts((current) => current.map((d) => d.id === draftId ? { ...d, taskId } : d)), []);
  const chatActions = useMemo(() => models ? { models, sessionId: state.session.id, tasks: state.tasks, onSent } : null,
    [models, state.session.id, state.tasks, onSent]);
  const graph = useMemo(() => {
    const g = sessionGraph(state, drafts);
    if (!g) throw new Error("Canvas needs a session with a narrative");
    return g;
  }, [state, drafts]);
  const satelliteAnchors = useMemo(() => new Map(graph.nodes.filter((n) => n.data.kind === "spec" || n.data.kind === "chat").map((n) => [n.id, n.anchors ?? []])), [graph]);
  const edges = useMemo<Edge[]>(() => graph.edges.map((e) => satelliteAnchors.has(e.source)
    ? { ...e, type: "straight", style: { strokeDasharray: "4 4" } }
    : { ...e, type: "smoothstep" }), [graph, satelliteAnchors]);
  const [level, setLevel] = useState<ZoomLevel>("concept");
  const levelRef = useRef(level);
  levelRef.current = level;
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const laidOutKey = useRef("");
  const offsets = useRef(new Map<string, { dx: number; dy: number }>());
  const basePos = useRef(new Map<string, { x: number; y: number }>());

  const place = (id: string, p: { x: number; y: number }) => {
    const o = offsets.current.get(id);
    return o ? { x: p.x + o.dx, y: p.y + o.dy } : p;
  };

  useEffect(() => offsets.current.clear(), [graph]);

  const arrange = (sized: { id: string; width: number; height: number }[]) => {
    const main = sized.filter((n) => !satelliteAnchors.has(n.id));
    const mainPos = layout(main, graph.edges.filter((e) => !satelliteAnchors.has(e.source)));
    const rects = new Map(main.map((n) => [n.id, { ...mainPos.get(n.id)!, width: n.width, height: n.height }]));
    const satellites = sized.filter((n) => satelliteAnchors.has(n.id)).map((n) => ({ ...n, anchors: satelliteAnchors.get(n.id)! }));
    return new Map([...mainPos, ...placeSatellites(rects, satellites)]);
  };

  useEffect(() => {
    const sized = graph.nodes.map((n) => ({ id: n.id, ...estimateSize(n.data, level) }));
    const pos = arrange(sized);
    basePos.current = pos;
    laidOutKey.current = "";
    setNodes(graph.nodes.map((n) => ({
      id: n.id,
      type: n.data.kind,
      data: { ...n.data, sessionId: state.session.id, level },
      position: place(n.id, pos.get(n.id)!),
      style: { width: n.data.kind === "spec" || n.data.kind === "chat" ? SATELLITE_WIDTH : NODE_WIDTH[level] },
      draggable: true,
      dragHandle: ".title",
    })));
  }, [graph, level, setNodes, state.session.id]);

  const sizeKey = nodes.map((n) => `${n.id}:${n.measured?.width ?? 0}x${n.measured?.height ?? 0}`).join("|");
  useEffect(() => {
    if (nodes.length !== graph.nodes.length || nodes.some((n) => !graph.nodes.some((g) => g.id === n.id))) return;
    if (nodes.length === 0 || nodes.some((n) => !n.measured?.height)) return;
    if (sizeKey === laidOutKey.current) return;
    laidOutKey.current = sizeKey;
    const pos = arrange(nodes.map((n) => ({ id: n.id, width: n.measured!.width!, height: n.measured!.height! })));
    basePos.current = pos;
    setNodes((ns) => ns.map((n) => ({ ...n, position: place(n.id, pos.get(n.id)!) })));
    const a = anchor.current && nodes.find((n) => n.id === anchor.current);
    if (a) {
      const p = place(a.id, pos.get(a.id)!);
      rf.setCenter(p.x + a.measured!.width! / 2, p.y + a.measured!.height! / 2, { zoom: rf.getZoom() });
      anchor.current = null;
    }
  }, [sizeKey, nodes, rf, setNodes, graph]);

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
    <AskContext.Provider value={models ? { ask } : null}><ChatActionsContext.Provider value={chatActions}>
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
    </ChatActionsContext.Provider></AskContext.Provider>
  );
}
