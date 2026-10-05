import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, Controls, Panel, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow,
  type Edge, type Node, type Viewport,
} from "@xyflow/react";
import type { ModelsResponse, SessionState } from "../shared/types.ts";
import { ChatActionsContext, type Draft } from "./chat-context.ts";
import { estimateSize, layout, placeSatellites, sessionGraph, visibleGraph, NODE_WIDTH, SATELLITE_WIDTH, zoomLevel, latestNarrative, type ChatNodeData, type GraphNode, type ZoomLevel } from "./graph.ts";
import { ChangeNode } from "./nodes/ChangeNode.tsx";
import { SummaryNode } from "./nodes/SummaryNode.tsx";
import { SpecNode } from "./nodes/SpecNode.tsx";
import { SearchfoxContext, searchfoxLinks } from "./searchfox-url.ts";
import { ChatNode } from "./nodes/ChatNode.tsx";
import { quoteRange } from "./quote-range.ts";
import { CollapseContext, useCollapsed } from "./collapse.ts";

const nodeTypes = { change: ChangeNode, summary: SummaryNode, spec: SpecNode, chat: ChatNode };

interface Props { state: SessionState; models?: ModelsResponse | null; drafts?: Draft[]; onSent?(draftId: string, taskId: string): void }
const NO_DRAFTS: Draft[] = [];

export function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ state, models = null, drafts = NO_DRAFTS, onSent = () => {} }: Props) {
  const searchfox = useMemo(() => {
    const latest = latestNarrative(state);
    return latest ? searchfoxLinks(state, latest.diff.data) : null;
  }, [state]);
  const rf = useReactFlow();
  const container = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);
  const knownDrafts = useRef(new Set<string>());
  useEffect(() => {
    const next = new Set(drafts.map((draft) => draft.id));
    const added = drafts.find((draft) => !knownDrafts.current.has(draft.id));
    knownDrafts.current = next;
    if (added) anchor.current = added.id;
  }, [drafts]);
  const chatActions = useMemo(() => models ? { models, sessionId: state.session.id, tasks: state.tasks, onSent } : null,
    [models, state.session.id, state.tasks, onSent]);
  const graph = useMemo(() => {
    const g = sessionGraph(state, drafts);
    if (!g) throw new Error("Canvas needs a session with a narrative");
    return g;
  }, [state, drafts]);
  const { collapsed, toggle, expandAll } = useCollapsed(state.session.id);
  const shown = useMemo(() => visibleGraph(graph, collapsed), [graph, collapsed]);
  const rangeOwner = useRef(new Map<AbstractRange, string>());
  const quoted = useMemo(() => graph.nodes.filter((n): n is GraphNode & { data: ChatNodeData & { quote: string } } => n.data.kind === "chat" && !!n.data.quote), [graph]);
  const [hoveredChat, setHoveredChat] = useState<string | null>(null);
  const [focusedChat, setFocusedChat] = useState<string | null>(null);
  const chatIds = useMemo(() => new Set(graph.nodes.filter((n) => n.data.kind === "chat").map((n) => n.id)), [graph]);
  const activeChat = hoveredChat && chatIds.has(hoveredChat) ? hoveredChat
    : focusedChat && chatIds.has(focusedChat) ? focusedChat : null;
  const rangeOf = (n: typeof quoted[number]) => container.current && quoteRange(container.current, n.data.anchor, n.data.quote, n.data.lines);
  const satelliteAnchors = useMemo(() => new Map(shown.nodes.filter((n) => n.data.kind === "spec" || n.data.kind === "chat").map((n) => [n.id, n.anchors ?? []])), [shown]);
  const edges = useMemo<Edge[]>(() => shown.edges.map((e) => satelliteAnchors.has(e.source)
    ? { ...e, type: "straight", style: { strokeDasharray: "4 4" } }
    : { ...e, type: "smoothstep" }), [shown, satelliteAnchors]);
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

  const arrange = (sized: { id: string; width: number; height: number }[], dy?: Map<string, number>) => {
    const main = sized.filter((n) => !satelliteAnchors.has(n.id));
    const mainPos = layout(main, shown.edges.filter((e) => !satelliteAnchors.has(e.source)));
    const rects = new Map(main.map((n) => [n.id, { ...mainPos.get(n.id)!, width: n.width, height: n.height }]));
    const satellites = sized.filter((n) => satelliteAnchors.has(n.id)).map((n) => ({ ...n, anchors: satelliteAnchors.get(n.id)!, ...(dy?.has(n.id) ? { dy: dy.get(n.id)! } : {}) }));
    return new Map([...mainPos, ...placeSatellites(rects, satellites)]);
  };

  useEffect(() => {
    const sized = shown.nodes.map((n) => ({ id: n.id, ...estimateSize(n.data, level) }));
    const pos = arrange(sized);
    basePos.current = pos;
    laidOutKey.current = "";
    setNodes(shown.nodes.map((n) => ({
      id: n.id,
      type: n.data.kind,
      data: { ...n.data, sessionId: state.session.id, level },
      position: place(n.id, pos.get(n.id)!),
      style: { width: n.data.kind === "spec" || n.data.kind === "chat" ? SATELLITE_WIDTH : NODE_WIDTH[level] },
      draggable: true,
      dragHandle: ".title",
    })));
  }, [shown, level, setNodes, state.session.id]);

  const sizeKey = nodes.map((n) => `${n.id}:${n.measured?.width ?? 0}x${n.measured?.height ?? 0}`).join("|");
  useEffect(() => {
    if (nodes.length !== shown.nodes.length || nodes.some((n) => !shown.nodes.some((g) => g.id === n.id))) return;
    if (nodes.length === 0 || nodes.some((n) => !n.measured?.height)) return;
    if (sizeKey === laidOutKey.current) return;
    laidOutKey.current = sizeKey;
    const dy = new Map<string, number>();
    for (const n of quoted) {
      const range = rangeOf(n);
      const anchorEl = container.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(n.anchors![0]!)}"]`);
      if (range && anchorEl) dy.set(n.id, (range.getBoundingClientRect().top - anchorEl.getBoundingClientRect().top) / rf.getZoom());
    }
    const pos = arrange(nodes.map((n) => ({ id: n.id, width: n.measured!.width!, height: n.measured!.height! })), dy);
    basePos.current = pos;
    setNodes((ns) => ns.map((n) => ({ ...n, position: place(n.id, pos.get(n.id)!) })));
    const a = anchor.current && nodes.find((n) => n.id === anchor.current);
    if (a) {
      const p = place(a.id, pos.get(a.id)!);
      rf.setCenter(p.x + a.measured!.width! / 2, p.y + a.measured!.height! / 2, { zoom: rf.getZoom() });
      anchor.current = null;
    }
  }, [sizeKey, nodes, rf, setNodes, shown]);

  const collapsedChatAt = (x: number, y: number) => {
    const highlight = CSS.highlights.get("chat-quote");
    for (const hit of CSS.highlights.highlightsFromPoint(x, y)) {
      if (hit.highlight !== highlight) continue;
      for (const range of hit.ranges) {
        const id = rangeOwner.current.get(range);
        if (id && collapsed.has(id)) return id;
      }
    }
    return null;
  };

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let frame = 0;
    const click = (event: MouseEvent) => {
      if (!getSelection()?.isCollapsed) return;
      const id = collapsedChatAt(event.clientX, event.clientY);
      if (!id) return;
      anchor.current = id;
      toggle(id);
    };
    const move = (event: PointerEvent) => {
      const over = collapsedChatAt(event.clientX, event.clientY) !== null;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => el.classList.toggle("over-collapsed-quote", over));
    };
    el.addEventListener("click", click);
    el.addEventListener("pointermove", move);
    return () => {
      el.removeEventListener("click", click);
      el.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
      el.classList.remove("over-collapsed-quote");
    };
  }, [collapsed, toggle]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const chatAt = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const id = target.closest(".react-flow__node")?.getAttribute("data-id") ?? null;
      return id && chatIds.has(id) ? id : null;
    };
    const over = (event: PointerEvent) => setHoveredChat(chatAt(event.target));
    const out = (event: PointerEvent) => {
      if (chatAt(event.relatedTarget)) return;
      setHoveredChat(null);
    };
    const focus = (event: FocusEvent) => setFocusedChat(chatAt(event.target));
    const blur = (event: FocusEvent) => {
      if (chatAt(event.relatedTarget)) return;
      setFocusedChat(null);
    };
    el.addEventListener("pointerover", over);
    el.addEventListener("pointerout", out);
    el.addEventListener("focusin", focus);
    el.addEventListener("focusout", blur);
    return () => {
      el.removeEventListener("pointerover", over);
      el.removeEventListener("pointerout", out);
      el.removeEventListener("focusin", focus);
      el.removeEventListener("focusout", blur);
    };
  }, [chatIds]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let frame = 0;
    const build = () => {
      const all: Range[] = [], active: Range[] = [];
      rangeOwner.current.clear();
      for (const n of quoted) {
        const range = rangeOf(n);
        if (!range) continue;
        all.push(range);
        rangeOwner.current.set(range, n.id);
        if (n.id === activeChat) active.push(range);
      }
      CSS.highlights.set("chat-quote", new Highlight(...all));
      const strong = new Highlight(...active);
      strong.priority = 1;
      CSS.highlights.set("chat-quote-active", strong);
    };
    // Synchronous: the previous run's cleanup deleted the highlights, and a click in this frame must still hit them.
    build();
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(build);
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      CSS.highlights.delete("chat-quote");
      CSS.highlights.delete("chat-quote-active");
    };
  }, [quoted, activeChat]);

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
    <ChatActionsContext.Provider value={chatActions}>
    <SearchfoxContext.Provider value={searchfox}><div ref={container} className="canvas" style={{ width: "100%", height: "100%" }}>
    <CollapseContext.Provider value={{ collapsed, toggle }}>
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
        <Panel position="top-right"><button onClick={expandAll}>Expand all</button><button onClick={reset}>Reset layout</button></Panel>
      </ReactFlow>
    </CollapseContext.Provider>
    </div></SearchfoxContext.Provider>
    </ChatActionsContext.Provider>
  );
}
