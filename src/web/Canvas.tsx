import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, useStore,
  type Edge, type Node, type Viewport,
} from "@xyflow/react";
import type { Artifact, ModelsResponse, PhabCommentData, SessionState } from "../shared/types.ts";
import { ChatActionsContext, type Draft } from "./chat-context.ts";
import { estimateSize, fitMinZoom, layout, placeSatellites, sessionGraph, visibleGraph, levelGraph, isSatellite, stackLayout, phabCommentCollapseId, NODE_WIDTH, LEVEL_MAX_ZOOM, SATELLITE_WIDTH, zoomLevel, latestNarrative, type ChatNodeData, type FindingNodeData, type GraphNode, type ZoomLevel } from "./graph.ts";
import { ChangeNode } from "./nodes/ChangeNode.tsx";
import { CommitNode } from "./nodes/CommitNode.tsx";
import { SummaryNode } from "./nodes/SummaryNode.tsx";
import { SpecNode } from "./nodes/SpecNode.tsx";
import { SearchfoxContext, searchfoxLinks } from "./searchfox-url.ts";
import { ChatNode } from "./nodes/ChatNode.tsx";
import { FindingNode } from "./nodes/FindingNode.tsx";
import { PhabThreadNode } from "./nodes/PhabThreadNode.tsx";
import { ConversationNode } from "./nodes/ConversationNode.tsx";
import { quoteRange } from "./quote-range.ts";
import { CollapseContext, useCollapsed } from "./collapse.ts";
import { useResolvedTheme } from "./theme.ts";
import { useTextScale } from "./text-scale.ts";
import { GuideBar } from "./GuideBar.tsx";
import { moveStep, startStep, stepNodeId } from "./guide.ts";
import { api } from "./api.ts";

const botCommentIds = (comments: Artifact<PhabCommentData>[], anchors: Record<string, string>) => comments.filter((comment) => comment.data.bot).map((comment) => phabCommentCollapseId(anchors[comment.data.phid]!));

const nodeTypes = { change: ChangeNode, commit: CommitNode, summary: SummaryNode, spec: SpecNode, chat: ChatNode, conversation: ConversationNode, finding: FindingNode, phab: PhabThreadNode };

interface Props { state: SessionState; models?: ModelsResponse | null; drafts?: Draft[]; onSent?(draftId: string, taskId: string): void }
const NO_DRAFTS: Draft[] = [];
const MINIMAP_COLOR: Record<keyof typeof nodeTypes, string> = { change: "var(--kind-change)", commit: "var(--kind-summary)", summary: "var(--kind-summary)", spec: "var(--kind-spec)", chat: "var(--kind-chat)", conversation: "var(--kind-chat)", finding: "var(--kind-finding)", phab: "var(--kind-phab)" };
const ARROW_PAN: Record<string, { x: number; y: number }> = {
  ArrowUp: { x: 0, y: -80 }, ArrowDown: { x: 0, y: 80 }, ArrowLeft: { x: -80, y: 0 }, ArrowRight: { x: 80, y: 0 },
};

export function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ state, models = null, drafts = NO_DRAFTS, onSent = () => {} }: Props) {
  const textScale = useTextScale();
  const paneHeight = useStore((s) => s.height);
  const colorMode = useResolvedTheme();
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
    if (!g) throw new Error("Canvas needs a session graph");
    return g;
  }, [state, drafts]);
  const defaults = useMemo(() => new Set(graph.nodes.flatMap((n) => n.data.kind === "finding" && n.data.collapsedByDefault ? [n.id]
    : n.data.kind === "phab" ? [...(n.data.done ? [n.id] : []), ...botCommentIds(n.data.comments, n.data.phabAnchors)]
      : n.data.kind === "summary" ? [
        ...n.data.phabUnanchored.filter((group) => group.outdatedEpoch !== null).map((group) => `phab-outdated:${group.outdatedEpoch}`),
        ...botCommentIds([...n.data.phabGeneral, ...n.data.phabUnanchored.flatMap((group) => group.comments)], n.data.phabAnchors),
      ] : [])), [graph]);
  const { collapsed, toggle, expandAll } = useCollapsed(state.session.id, defaults);
  const [level, setLevel] = useState<ZoomLevel>("code");
  const levelRef = useRef(level);
  const open = useMemo(() => visibleGraph(graph, collapsed), [graph, collapsed]);
  const shown = useMemo(() => levelGraph(open, level), [open, level]);
  const rangeOwner = useRef(new Map<AbstractRange, string>());
  const quoted = useMemo(() => graph.nodes.filter((n): n is GraphNode & { data: (ChatNodeData | FindingNodeData) & { quote: string } } => (n.data.kind === "chat" || n.data.kind === "finding") && !!n.data.quote), [graph]);
  const [hoveredChat, setHoveredChat] = useState<string | null>(null);
  const [focusedChat, setFocusedChat] = useState<string | null>(null);
  const [hoveredQuote, setHoveredQuote] = useState<string | null>(null);
  // Open quoted boxes only: a box removed by collapsing gets no pointerout or focusout.
  const quotedBoxIds = useMemo(() => new Set(shown.nodes.filter((n) => (n.data.kind === "chat" || n.data.kind === "finding") && !!n.data.quote).map((n) => n.id)), [shown]);
  const activeQuote = hoveredQuote ?? (hoveredChat && quotedBoxIds.has(hoveredChat) ? hoveredChat
    : focusedChat && quotedBoxIds.has(focusedChat) ? focusedChat : null);
  const rangeOf = (n: typeof quoted[number]) => container.current && quoteRange(container.current, n.data.anchor, n.data.quote, n.data.lines);
  const satelliteAnchors = useMemo(() => new Map(shown.nodes.filter((n) => isSatellite(n.data)).map((n) => [n.id, n.anchors ?? []])), [shown]);
  const edges = useMemo<Edge[]>(() => shown.edges.map((e) => satelliteAnchors.has(e.source)
    ? { ...e, type: "straight", style: { strokeDasharray: "4 4" } }
    : { ...e, type: "smoothstep" }), [shown, satelliteAnchors]);
  // Until the user touches the canvas, every measured layout refits the view, so nodes that arrive later (findings) show up.
  const autoFit = useRef(true);
  const flying = useRef(false);
  levelRef.current = level;
  // A new epoch is a new graph: fit it again even if the user moved the previous one.
  const rootId = graph.nodes[0]!.id;
  useEffect(() => { autoFit.current = true; }, [rootId]);
  const steps = useMemo(() => graph.nodes.flatMap((n) => n.data.kind === "change" ? [n.data] : []), [graph]);
  const start = startStep(steps.map((s) => s.reviewed));
  const [guideStep, setGuideStep] = useState<number | null>(null);
  useEffect(() => setGuideStep(null), [rootId]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const currentId = guideStep === null || !steps[guideStep] ? null : stepNodeId(steps[guideStep], level);
  const currentRef = useRef<string | null>(currentId);
  currentRef.current = currentId;
  const focusNode = (id: string) => {
    const node = rf.getNode(id);
    if (!node) return;
    const w = node.measured?.width ?? NODE_WIDTH[level] * textScale;
    const h = node.measured?.height ?? 0;
    const zoom = rf.getZoom();
    const view = paneHeight / zoom;
    autoFit.current = false;
    // The zoom-pan interpolation dips in zoom mid-flight; the level is judged by the final zoom only.
    flying.current = true;
    void rf.setCenter(node.position.x + w / 2, h <= view ? node.position.y + h / 2 : node.position.y + view / 2 - 24 / zoom, { zoom, duration: 200 }).then(() => {
      flying.current = false;
      onMove(null, rf.getViewport());
    });
  };
  const moveGuide = (delta: 1 | -1) => {
    if (!steps.length) return;
    const next = moveStep(steps.length, guideStep, delta, start);
    setGuideStep(next);
    focusNode(stepNodeId(steps[next]!, level));
  };
  const toggleReviewed = () => {
    if (guideStep === null || !chatActions) return;
    const s = steps[guideStep]!;
    void api.setReviewed(chatActions.sessionId, s.narrativeId, s.change.id, !s.reviewed).catch((error: Error) => console.error(error));
  };
  const guideRef = useRef({ move: moveGuide, toggleReviewed });
  guideRef.current = { move: moveGuide, toggleReviewed };
  const laidOutKey = useRef("");
  const offsets = useRef(new Map<string, { dx: number; dy: number }>());
  const basePos = useRef(new Map<string, { x: number; y: number }>());

  const place = (id: string, p: { x: number; y: number }) => {
    const o = offsets.current.get(id);
    return o ? { x: p.x + o.dx, y: p.y + o.dy } : p;
  };

  useEffect(() => offsets.current.clear(), [graph]);

  // Offset of each quote below its anchor's top, in flow units. Measured whenever the anchor is rendered, so a
  // chat placed before its anchor was measured moves to its quote once it is.
  const quoteDy = useRef(new Map<string, number>());
  const [quoteDyVersion, setQuoteDyVersion] = useState(0);
  useEffect(() => quoteDy.current.clear(), [level]);
  const measureQuoteDy = () => {
    let changed = false;
    for (const n of quoted) {
      const range = rangeOf(n);
      const anchorEl = container.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(n.anchors![0]!)}"]`);
      if (!range || !anchorEl) continue;
      const dy = (range.getBoundingClientRect().top - anchorEl.getBoundingClientRect().top) / rf.getZoom();
      if (Math.abs(dy - (quoteDy.current.get(n.id) ?? NaN)) <= 0.5) continue;
      quoteDy.current.set(n.id, dy);
      changed = true;
    }
    return changed;
  };

  const arrange = (sized: { id: string; width: number; height: number }[], dy?: Map<string, number>) => {
    if (shown.nodes.some((n) => n.data.kind === "commit")) {
      const byId = new Map(shown.nodes.map((n) => [n.id, n]));
      return stackLayout(sized.map((s) => { const n = byId.get(s.id)!; return { ...s, data: n.data, anchors: n.anchors ?? [], ...(dy?.has(s.id) ? { dy: dy.get(s.id)! } : {}) }; }), shown.edges);
    }
    const main = sized.filter((n) => !satelliteAnchors.has(n.id));
    const mainPos = layout(main, shown.edges.filter((e) => !satelliteAnchors.has(e.source)));
    const rects = new Map(main.map((n) => [n.id, { ...mainPos.get(n.id)!, width: n.width, height: n.height }]));
    const satellites = sized.filter((n) => satelliteAnchors.has(n.id)).map((n) => ({ ...n, anchors: satelliteAnchors.get(n.id)!, ...(dy?.has(n.id) ? { dy: dy.get(n.id)! } : {}) }));
    return new Map([...mainPos, ...placeSatellites(rects, satellites)]);
  };

  const sizeBasis = useRef("");
  useEffect(() => {
    // A new graph object (every session event) keeps the measured sizes of unchanged zoom and text scale, so
    // the view does not jump to estimated positions until the next measurement.
    const basis = `${level}|${textScale}`;
    const keepMeasured = basis === sizeBasis.current;
    sizeBasis.current = basis;
    const measured = new Map(keepMeasured ? rf.getNodes().flatMap((n) => n.measured?.width && n.measured.height ? [[n.id, n.measured] as const] : []) : []);
    const sized = shown.nodes.map((n) => {
      const m = measured.get(n.id);
      return { id: n.id, ...(m ? { width: m.width!, height: m.height! } : estimateSize(n.data, level, textScale)) };
    });
    const pos = arrange(sized, keepMeasured ? quoteDy.current : undefined);
    basePos.current = pos;
    laidOutKey.current = "";
    setNodes(shown.nodes.map((n) => ({
      id: n.id,
      type: n.data.kind,
      data: { ...n.data, sessionId: state.session.id, level },
      position: place(n.id, pos.get(n.id)!),
      ...(measured.has(n.id) ? { measured: measured.get(n.id) } : {}),
      style: { width: (isSatellite(n.data) ? SATELLITE_WIDTH : NODE_WIDTH[level]) * textScale },
      className: n.id === currentRef.current ? "guide-current" : undefined,
      draggable: true,
      dragHandle: ".title",
    })));
  }, [shown, level, textScale, setNodes, state.session.id]);

  useEffect(() => {
    setNodes((ns) => ns.map((n) => ({ ...n, className: n.id === currentId ? "guide-current" : undefined })));
  }, [currentId, setNodes]);

  const sizeKey = nodes.map((n) => `${n.id}:${n.measured?.width ?? 0}x${n.measured?.height ?? 0}`).join("|");
  useEffect(() => {
    if (nodes.length !== shown.nodes.length || nodes.some((n) => !shown.nodes.some((g) => g.id === n.id))) return;
    if (nodes.length === 0 || nodes.some((n) => !n.measured?.height)) return;
    const key = `${sizeKey}#${quoteDyVersion}`;
    if (key === laidOutKey.current) return;
    laidOutKey.current = key;
    measureQuoteDy();
    const pos = arrange(nodes.map((n) => ({ id: n.id, width: n.measured!.width!, height: n.measured!.height! })), quoteDy.current);
    basePos.current = pos;
    setNodes((ns) => ns.map((n) => ({ ...n, position: place(n.id, pos.get(n.id)!) })));
    const a = anchor.current && nodes.find((n) => n.id === anchor.current);
    if (a) {
      const p = place(a.id, pos.get(a.id)!);
      rf.setCenter(p.x + a.measured!.width! / 2, p.y + a.measured!.height! / 2, { zoom: rf.getZoom() });
      anchor.current = null;
      autoFit.current = false;
    } else if (autoFit.current) {
      const fitFloor = fitMinZoom(textScale, levelRef.current, shown.nodes.some((n) => n.data.kind === "commit"));
      void rf.fitView({ maxZoom: Math.max(LEVEL_MAX_ZOOM[levelRef.current], fitFloor.minZoom ?? 0), ...fitFloor });
    }
  }, [sizeKey, quoteDyVersion, nodes, rf, setNodes, shown, textScale]);

  const quoteAt = (x: number, y: number) => {
    for (const hit of CSS.highlights.highlightsFromPoint(x, y)) {
      if (hit.highlight !== CSS.highlights.get("chat-quote") && hit.highlight !== CSS.highlights.get("finding-quote")) continue;
      for (const range of hit.ranges) {
        const id = rangeOwner.current.get(range);
        if (id) return id;
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
      const id = quoteAt(event.clientX, event.clientY);
      if (!id || !collapsed.has(id)) return;
      anchor.current = id;
      toggle(id);
    };
    const move = (event: PointerEvent) => {
      const id = quoteAt(event.clientX, event.clientY);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setHoveredQuote(id);
        el.classList.toggle("over-collapsed-quote", id !== null && collapsed.has(id));
      });
    };
    // User input interrupts a guide flight, whose promise then never resolves.
    const stopAutoFit = () => { autoFit.current = false; flying.current = false; };
    const leave = () => {
      cancelAnimationFrame(frame);
      setHoveredQuote(null);
      el.classList.remove("over-collapsed-quote");
    };
    el.addEventListener("click", click);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", stopAutoFit, true);
    el.addEventListener("wheel", stopAutoFit, true);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("click", click);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointerdown", stopAutoFit, true);
      el.removeEventListener("wheel", stopAutoFit, true);
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
      return id && quotedBoxIds.has(id) ? id : null;
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
  }, [quotedBoxIds]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let frame = 0;
    const build = () => {
      const chat: Range[] = [], finding: Range[] = [], chatActive: Range[] = [], findingActive: Range[] = [];
      rangeOwner.current.clear();
      for (const n of quoted) {
        const range = rangeOf(n);
        if (!range) continue;
        (n.data.kind === "chat" ? chat : finding).push(range);
        rangeOwner.current.set(range, n.id);
        if (n.id === activeQuote) (n.data.kind === "chat" ? chatActive : findingActive).push(range);
      }
      CSS.highlights.set("chat-quote", new Highlight(...chat));
      CSS.highlights.set("finding-quote", new Highlight(...finding));
      const chatStrong = new Highlight(...chatActive), findingStrong = new Highlight(...findingActive);
      chatStrong.priority = findingStrong.priority = 1;
      CSS.highlights.set("chat-quote-active", chatStrong);
      CSS.highlights.set("finding-quote-active", findingStrong);
      if (measureQuoteDy()) setQuoteDyVersion((v) => v + 1);
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
      CSS.highlights.delete("finding-quote");
      CSS.highlights.delete("chat-quote-active");
      CSS.highlights.delete("finding-quote-active");
    };
  }, [quoted, activeQuote]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const keydown = (event: KeyboardEvent) => {
      const step = ARROW_PAN[event.key];
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "n" || event.key === "p") {
        event.preventDefault();
        guideRef.current.move(event.key === "n" ? 1 : -1);
        return;
      }
      if (event.key === "r") {
        event.preventDefault();
        guideRef.current.toggleReviewed();
        return;
      }
      if (!step) return;
      event.preventDefault();
      autoFit.current = false;
      flying.current = false;
      const vp = rf.getViewport();
      void rf.setViewport({ ...vp, x: vp.x - step.x, y: vp.y - step.y });
    };
    el.addEventListener("keydown", keydown);
    return () => el.removeEventListener("keydown", keydown);
  }, [rf]);

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
    if (flying.current) return;
    const next = zoomLevel(vp.zoom, levelRef.current);
    if (next !== levelRef.current) {
      if (!autoFit.current) anchor.current = nodeNearestCenter();
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
    <SearchfoxContext.Provider value={searchfox}><div ref={container} className="canvas" tabIndex={-1} style={{ width: "100%", height: "100%" }}>
    {steps.length > 0 && <GuideBar steps={steps} step={guideStep} start={start} canToggle={!!chatActions} onMove={moveGuide} onToggle={toggleReviewed} />}
    <CollapseContext.Provider value={{ collapsed, toggle }}>
      <div className="canvas-layout">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onMove={onMove}
        nodesDraggable
        nodesConnectable={false}
        onNodeDragStop={(_, node) => {
          const b = basePos.current.get(node.id)!;
          offsets.current.set(node.id, { dx: node.position.x - b.x, dy: node.position.y - b.y });
        }}
        panOnScroll
        disableKeyboardA11y
        minZoom={0.1}
        maxZoom={2}
        colorMode={colorMode}
      >
        <Background />
        <Controls showInteractive={false} onZoomIn={() => { autoFit.current = false; }} onZoomOut={() => { autoFit.current = false; }} />
        <Panel position="top-right"><button onClick={expandAll}>Expand all</button><button onClick={reset}>Reset layout</button></Panel>
      </ReactFlow>
      <MiniMap
        position="top-right"
        className="canvas-minimap"
        style={{ position: "relative", width: 140, height: paneHeight, margin: 0, flexShrink: 0 }}
        pannable
        zoomable
        nodeColor={(n) => MINIMAP_COLOR[n.type as keyof typeof nodeTypes]}
        bgColor="var(--minimap-bg)"
        maskColor="var(--minimap-mask)"
      />
      </div>
    </CollapseContext.Provider>
    </div></SearchfoxContext.Provider>
    </ChatActionsContext.Provider>
  );
}
