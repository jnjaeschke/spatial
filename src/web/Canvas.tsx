import { Fragment, createContext, createElement, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  Background, Controls, MiniMap, NodeResizer, Panel, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, useStore,
  type Edge, type MiniMapNodeProps, type Node, type NodeProps, type ResizeParams, type Viewport,
} from "@xyflow/react";
import type { ModelsResponse, SessionState } from "../shared/types.ts";
import { ChatActionsContext, type Draft } from "./chat-context.ts";
import { closeGraph, fitMinZoom, hostedThreads, layout, placeSatellites, sessionGraph, visibleGraph, isSatellite, SATELLITE_WIDTH, type ChatNodeData, type Graph, type GraphEdge, type GraphNode, type GraphNodeData, type PlacedNode } from "./graph.ts";
import { quoteRange } from "./quote-range.ts";
import { CollapseContext, useCollapsed } from "./collapse.ts";
import { ClosedContext, useClosed } from "./closed.ts";
import { useLayers } from "./layers.ts";
import { useResolvedTheme } from "./theme.ts";
import { useTextScale } from "./text-scale.ts";
import { GuideBar } from "./GuideBar.tsx";
import { moveStep, startStep } from "./guide.ts";
import { useNodeSizes, type NodeSize } from "./node-sizes.ts";
import { useFreePositions } from "./free-positions.ts";
import { clampGuideStep, readViewState, saveViewState, type ViewState } from "./view-state.ts";
import { parseHistoryView, pushJump, replaceUrl, saveHistoryView, useViewHistory, type HistoryView } from "./view-history.ts";
import { RouteContext, parseRoute, routeUrl } from "./routes.ts";
import { RecentPlaces } from "./RecentPlaces.tsx";
import { IconButton, NodeKindsContext } from "./plugin-api.ts";
import { OpenPlaceContext } from "./open-place.ts";

/** A step of the guide bar's reading path. */
export interface GuideStep {
  title: string;
  /** Short label before the title (the commit of a stack). */
  tag?: string;
  reviewed: boolean;
  /** The node to center for this step. */
  nodeId: string;
  /** The place this step opens instead of centering `nodeId`. */
  place?: string;
  /** Without it the guide bar offers no reviewed toggle for the step. */
  toggleReviewed?(sessionId: string): Promise<unknown>;
}
/** A diff row to highlight and scroll to; `anchor` is the diff row anchor (`${diffId}#${hunkId}`). */
export interface FocusedRow { anchor: string; side: "new" | "old"; line: number }
export interface CanvasProviderProps {
  state: SessionState;
  /** The graph as shown: after layers and closed nodes, before places and collapsing. */
  graph: Graph;
  /** No server behind the view (a past epoch or a static export): nothing may be requested. */
  readOnly: boolean;
  /** Expands the collapse id, centers the node (first switching to `place` when given), and records the jump in the view history. */
  reveal(nodeId: string, collapseId: string, place?: string): void;
  /** Highlights a diff row and scrolls it into view. */
  focusRow(row: FocusedRow): void;
  children: ReactNode;
}
/** What the phase view tells the canvas about its graph; everything but `graph` is optional. */
export interface CanvasModel {
  /** Root graph (first node = root); null when there is nothing to show. Core adds notes, chats and free positions. */
  graph(state: SessionState, drafts: Draft[]): Graph | null;
  /** Collapse ids that start collapsed. */
  collapsedByDefault?(graph: Graph): string[];
  /** The reading path of the guide bar and its `n`/`p`/`r` keys at a place (null without places); none or empty shows no bar. */
  guide?(graph: Graph, place: string | null): GuideStep[];
  /** Layers the user can hide ("Show on canvas"); `hide` removes the hidden layers' nodes and what hangs off them. */
  layers?: { list: { id: string; label: string }[]; hide(graph: Graph, hidden: ReadonlySet<string>): Graph };
  /** Named places of a canvas, e.g. a review's stack, one patch, one change. Ids are opaque to core. */
  places?: {
    /** The place shown first, and the fallback for a stored place `graph` rejects. */
    initial(graph: Graph): string;
    /** The graph shown at `place`, or null when the place does not exist in `graph`. */
    graph(graph: Graph, place: string): Graph | null;
    /** The place a node opens into, or null when it opens nothing. */
    open(graph: Graph, place: string, nodeId: string): string | null;
    /** The enclosing place and the node in it that leads to `place`; null at the top. */
    up(graph: Graph, place: string): { place: string; nodeId: string } | null;
    /** Breadcrumb from the top place to `place`. */
    crumbs(graph: Graph, place: string): { place: string; label: string }[];
  };
  /** Stacks (parallel lanes) lay out with `layout` instead of dagre at the places where `is` holds. */
  stack?: { is(graph: Graph, place: string | null): boolean; layout(nodes: PlacedNode[], edges: GraphEdge[]): Map<string, { x: number; y: number }> };
  /** Edges that only steer the dagre layout; the displayed edges stay as they are. */
  layoutEdges?(nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[];
  /** Quoted items a node hosts besides its chats (e.g. findings), highlighted in the text of their `anchor`. */
  quotes?(data: GraphNodeData): { id: string; kind: string; anchor: string; quote: string; lines?: ChatNodeData["lines"] }[];
  /** Lines drawn across a node in the minimap, `at` from 0 (top) to 1 (bottom); `kind` becomes a class. */
  minimapMarks?(data: GraphNodeData): { at: number; kind: string }[];
  /** Nodes to center when they first appear after the canvas has loaded (a freshly generated diagram). */
  revealWhenAdded?(node: GraphNode): boolean;
  /** Wraps the canvas in the plugin's contexts. */
  Provider?: ComponentType<CanvasProviderProps>;
  /** The breadcrumb's focus segment: a label for the focused row of `nodeId` (`row` is null when no row has focus), or for the selected node. `graph` is the graph at the current place. Null shows nothing. */
  focusLabel?(graph: Graph, nodeId: string, row: FocusedRow | null): string | null;
  /** Controls shown in the canvas panel (top right) after the layer toggles; rendered inside `Provider`. */
  PanelExtras?: ComponentType;
}
const NO_STEPS: GuideStep[] = [];
const MIN_NODE_WIDTH = 240;
const NO_PROVIDER: ComponentType<CanvasProviderProps> = ({ children }) => <>{children}</>;

/** The `quote` of a node, highlighted in the text of its `anchor`: chat threads, and plugin nodes (findings) that carry both. */
const quoteOf = (data: GraphNodeData) => "quote" in data && typeof data.quote === "string" && data.quote && "anchor" in data && typeof data.anchor === "string"
  ? { kind: data.kind, anchor: data.anchor, quote: data.quote, lines: ("lines" in data ? data.lines : undefined) as ChatNodeData["lines"] } : null;

const ResizeContext = createContext<{ textScale: number; resized(id: string, from: ResizeParams, to: ResizeParams): void } | null>(null);
function ResizableNode(props: NodeProps) {
  const kinds = useContext(NodeKindsContext);
  const resize = useContext(ResizeContext);
  const start = useRef<ResizeParams | null>(null);
  const kind = kinds[props.type];
  if (!kind) throw new Error(`Unknown node type: ${props.type}`);
  const Original = kind.component;
  if (kind.resizable === false) return createElement(Original, props);
  return <>
    {createElement(Original, props)}
    {resize && <NodeResizer
      minWidth={MIN_NODE_WIDTH * resize.textScale}
      minHeight={60 * resize.textScale}
      onResizeStart={(_, params) => { start.current = params; }}
      onResizeEnd={(_, params) => resize.resized(props.id, start.current!, params)}
    />}
  </>;
}
export interface CanvasProps { state: SessionState; model: CanvasModel; /** Key of the canvas's client view state (viewport, free positions, sizes, collapsed and closed nodes); default the session id. */ viewKey?: string; closed?: ReturnType<typeof useClosed>; models?: ModelsResponse | null; drafts?: Draft[]; onSent?(draftId: string, taskId: string): void; onDiscard?(draftId: string): void; onOpenAside?(draft: Draft, position: { x: number; y: number }): void }
const NO_DRAFTS: Draft[] = [];
const ARROW_PAN: Record<string, { x: number; y: number }> = {
  ArrowUp: { x: 0, y: -80 }, ArrowDown: { x: 0, y: 80 }, ArrowLeft: { x: -80, y: 0 }, ArrowRight: { x: 80, y: 0 },
};

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ state, model, viewKey: viewKeyProp, closed: sharedClosed, models = null, drafts = NO_DRAFTS, onSent = () => {}, onDiscard = () => {}, onOpenAside = () => {} }: CanvasProps) {
  const viewKey = viewKeyProp ?? state.session.id;
  const nodeKinds = useContext(NodeKindsContext);
  const routeContext = useContext(RouteContext);
  const nodeTypes = useMemo(() => Object.fromEntries(Object.keys(nodeKinds).map((type) => [type, ResizableNode])), [nodeKinds]);
  const textScale = useTextScale();
  const { sizes, setSize, clear: clearNodeSizes } = useNodeSizes(viewKey);
  const { positions: freePositions, set: setFreePosition, move: moveFreePosition, remove: removeFreePosition } = useFreePositions(viewKey);
  const paneHeight = useStore((s) => s.height);
  const colorMode = useResolvedTheme();
  const rf = useReactFlow();
  const container = useRef<HTMLDivElement>(null);
  const anchor = useRef<string | null>(null);
  // A revealed node that is still collapsed: anchor it once its measured height changes, since an unrelated
  // re-layout can run before the expansion is measured and would center on the collapsed size.
  const anchorOnResize = useRef<{ id: string; height: number } | null>(null);
  // A draft opened by double-click; its input is focused once laid out (React Flow hides unmeasured nodes,
  // and hidden elements cannot take focus).
  const focusDraft = useRef<string | null>(null);
  const knownDrafts = useRef(new Set<string>());
  const knownRevealed = useRef<Set<string> | null>(null);
  const chatActions = useMemo(() => models ? { models, sessionId: state.session.id, tasks: state.tasks, onSent, onDiscard: (id: string) => { removeFreePosition(id); onDiscard(id); }, onNote: (draftId: string, noteId: string) => { moveFreePosition(draftId, noteId); onDiscard(draftId); } } : null,
    [models, state.session.id, state.tasks, onSent, onDiscard, removeFreePosition, moveFreePosition]);
  const ownClosed = useClosed(viewKey);
  const { closed: closedIds, close, reopen } = sharedClosed ?? ownClosed;
  const { hidden: hiddenLayers, toggle: toggleLayer } = useLayers(model.layers?.list.map((layer) => layer.id) ?? []);
  const { graph, closedOn } = useMemo(() => {
    const g = sessionGraph(model.graph, state, drafts, freePositions);
    if (!g) throw new Error("Canvas needs a session graph");
    return closeGraph(model.layers && hiddenLayers.size ? model.layers.hide(g, hiddenLayers) : g, closedIds);
  }, [model, state, drafts, freePositions, closedIds, hiddenLayers]);
  const closedValue = useMemo(() => ({ close, reopen, closedOn }), [close, reopen, closedOn]);
  useLayoutEffect(() => {
    const next = new Set(drafts.map((draft) => draft.id));
    const added = drafts.find((draft) => !knownDrafts.current.has(draft.id));
    knownDrafts.current = next;
    if (!added) return;
    const host = graph.nodes.find((node) => hostedThreads(node.data)?.some((thread) => thread.draftId === added.id));
    focusDraft.current = added.id;
    anchor.current = host?.id ?? (added.aside ? null : added.id);
  }, [drafts, graph]);
  useEffect(() => {
    for (const draft of drafts) {
      if (!draft.taskId) continue;
      const thread = state.artifacts.find((a) => a.type === "ChatThread" && a.provenance.taskId === draft.taskId);
      if (thread) moveFreePosition(draft.id, thread.id);
    }
  }, [drafts, state.artifacts, moveFreePosition]);
  const revealedIds = useMemo(() => model.revealWhenAdded ? graph.nodes.filter(model.revealWhenAdded).map((n) => n.id) : [], [model, graph]);
  const defaults = useMemo(() => new Set(model.collapsedByDefault?.(graph) ?? []), [model, graph]);
  const { collapsed, toggle, expandAll, reveal: expandExplicitly } = useCollapsed(viewKey, defaults);
  const places = model.places;
  // Where the canvas starts: the URL's place if the graph has it, else the stored one, else the initial place. A reload or
  // traversal restores its history entry's own view; any other start uses the stored view, if it was stored for that place.
  const initial = useMemo(() => {
    const stored = readViewState(viewKey);
    const route = routeContext ? parseRoute(new URL(location.href)) : null;
    const urlPlace = route?.kind === "session" ? route.place : null;
    const wanted = urlPlace ?? stored?.place ?? null;
    const chosen = places ? wanted !== null && places.graph(graph, wanted) ? wanted : places.initial(graph) : null;
    const type = navigation.activation?.navigationType;
    const entry = routeContext && (type === "reload" || type === "traverse") ? parseHistoryView(navigation.currentEntry?.getState()) : null;
    const restored = entry?.place === chosen ? entry : null;
    const view: ViewState | null = restored ?? (stored?.place === chosen ? stored : null);
    return { place: chosen, view, focusedRow: restored?.focusedRow ?? null };
  }, []);
  const storedView = useRef(initial.view);
  const [placeState, setPlaceState] = useState<string | null>(initial.place);
  const { place, placed } = useMemo(() => {
    if (!places) return { place: null, placed: graph };
    const stored = placeState === null ? null : places.graph(graph, placeState);
    if (stored) return { place: placeState, placed: stored };
    const initial = places.initial(graph);
    const initialGraph = places.graph(graph, initial);
    if (!initialGraph) throw new Error(`Initial place ${initial} does not exist`);
    return { place: initial, placed: initialGraph };
  }, [places, graph, placeState]);
  const placeRef = useRef(place);
  placeRef.current = place;
  // Every place change that is not already a navigation (the first mount, a graph that drops the place) rewrites the URL in place.
  useEffect(() => {
    if (!routeContext || place === null) return;
    const route = parseRoute(new URL(location.href));
    if (route?.kind === "session" && route.place !== place) replaceUrl(routeUrl({ kind: "session", sessionId: routeContext.sessionId, place }));
  }, [routeContext, place]);
  useEffect(() => {
    if (place === placeState) return;
    if (placeState !== null) storedView.current = null;
    setPlaceState(place);
  }, [place, placeState]);
  const steps = useMemo(() => model.guide?.(graph, place) ?? NO_STEPS, [model, graph, place]);
  const shown = useMemo(() => visibleGraph(placed, collapsed), [placed, collapsed]);
  useLayoutEffect(() => {
    const next = new Set(revealedIds);
    if (!knownRevealed.current) { knownRevealed.current = next; return; }
    const added = revealedIds.find((id) => !knownRevealed.current!.has(id));
    knownRevealed.current = next;
    if (added && shown.nodes.some((n) => n.id === added)) anchor.current = added;
  }, [revealedIds, shown]);
  const rangeOwner = useRef(new Map<AbstractRange, string>());
  const quoted = useMemo(() => {
    const entries: { id: string; anchors: string[]; data: { kind: string; anchor: string; quote: string; lines?: ChatNodeData["lines"] } }[] = [];
    for (const node of graph.nodes) {
      const quote = quoteOf(node.data);
      if (quote) entries.push({ id: node.id, anchors: node.anchors ?? [], data: quote });
      for (const { id, ...data } of model.quotes?.(node.data) ?? []) entries.push({ id, anchors: [node.id], data });
      for (const thread of hostedThreads(node.data) ?? []) if (thread.quote) entries.push({ id: thread.threadId ?? thread.draftId!, anchors: [node.id], data: { kind: "chat", anchor: thread.anchor, quote: thread.quote, lines: thread.lines } });
    }
    return entries;
  }, [model, graph]);
  const [hoveredChat, setHoveredChat] = useState<string | null>(null);
  const [focusedChat, setFocusedChat] = useState<string | null>(null);
  const [hoveredQuote, setHoveredQuote] = useState<string | null>(null);
  // Open quoted boxes only: a box removed by collapsing gets no pointerout or focusout.
  const quotedBoxIds = useMemo(() => new Set(quoted.filter((item) => item.data.kind !== "chat" || !collapsed.has(item.id)).filter((item) => shown.nodes.some((node) => node.id === item.anchors[0])).map((item) => item.id)), [quoted, shown, collapsed]);
  const activeQuote = hoveredQuote ?? (hoveredChat && quotedBoxIds.has(hoveredChat) ? hoveredChat
    : focusedChat && quotedBoxIds.has(focusedChat) ? focusedChat : null);
  const rangeOf = (n: typeof quoted[number]) => container.current && quoteRange(container.current, n.data.anchor, n.data.quote, n.data.lines);
  const satelliteAnchors = useMemo(() => new Map(shown.nodes.filter(isSatellite).map((n) => [n.id, n.anchors ?? []])), [shown]);
  const edges = useMemo<Edge[]>(() => shown.edges.map((e) => satelliteAnchors.has(e.source)
    ? { ...e, type: "straight", style: { strokeDasharray: "4 4" } }
    : { ...e, type: "smoothstep" }), [shown, satelliteAnchors]);
  // Until the user touches the canvas, every measured layout refits the view, so nodes that arrive later (findings) show up.
  const autoFit = useRef(true);
  // A new epoch is a new graph: fit it again even if the user moved the previous one.
  const rootId = graph.nodes[0]!.id;
  const previousRootId = useRef(rootId);
  const start = startStep(steps.map((s) => s.reviewed));
  const [guideStep, setGuideStep] = useState<number | null>(() => clampGuideStep(storedView.current?.guideStep ?? null, steps.length));
  const guideStepRef = useRef(guideStep);
  guideStepRef.current = guideStep;
  const guideByPlace = useRef(new Map<string, number | null>());
  const savePlaceView = useRef(routeContext !== null);
  const selectAfterLayout = useRef<string | null>(null);
  const opening = useRef(false);
  useEffect(() => {
    if (previousRootId.current === rootId) return;
    previousRootId.current = rootId;
    storedView.current = null;
    autoFit.current = true;
    setGuideStep(null);
  }, [rootId]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  // The minimap node component keeps its identity across renders (a new one would remount every minimap node); it reads the current marks from a ref.
  const marksById = useRef(new Map<string, { at: number; kind: string }[]>());
  marksById.current = useMemo(() => new Map(nodes.map((node) => [node.id, model.minimapMarks?.(node.data as GraphNodeData) ?? []])), [nodes, model]);
  const minimapNode = useMemo(() => {
    return function CanvasMiniMapNode({ id, x, y, width, height, borderRadius, className, color, strokeColor, strokeWidth, shapeRendering, selected }: MiniMapNodeProps) {
      return <g transform={`translate(${x},${y})`}>
        <rect x={0} y={0} width={width} height={height} rx={borderRadius} ry={borderRadius} fill={color} stroke={strokeColor} strokeWidth={strokeWidth} shapeRendering={shapeRendering} className={["react-flow__minimap-node", selected && "selected", className].filter(Boolean).join(" ")} />
        {(marksById.current.get(id) ?? []).map((mark, index) => <line key={index} className={`minimap-mark kind-${mark.kind}`} x1={0} x2={width} y1={height * mark.at} y2={height * mark.at} strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
      </g>;
    };
  }, []);
  const [focusedRow, setFocusedRow] = useState<FocusedRow | null>(initial.focusedRow);
  const focusedRowRef = useRef(focusedRow);
  focusedRowRef.current = focusedRow;
  const labelRef = useRef("");
  const focusCentered = useRef(initial.focusedRow !== null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    root.querySelector("tr.focus")?.classList.remove("focus");
    const row = focusedRow && root.querySelector(`tr[data-anchor="${CSS.escape(focusedRow.anchor)}"][data-${focusedRow.side}="${focusedRow.line}"]`);
    setFocusNodeId(row?.closest(".react-flow__node[data-id]")?.getAttribute("data-id") ?? null);
    if (!row) return;
    row.classList.add("focus");
    if (focusCentered.current) return;
    focusCentered.current = true;
    // scrollIntoView would scroll React Flow's overflow-hidden pane; move the viewport instead.
    requestAnimationFrame(() => {
      const rect = row.getBoundingClientRect();
      const point = rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      void rf.setCenter(point.x, point.y, { zoom: rf.getZoom(), duration: 200 });
    });
  }, [focusedRow, nodes]);
  const currentId = guideStep === null || !steps[guideStep] ? null : steps[guideStep].nodeId;
  const currentRef = useRef<string | null>(currentId);
  currentRef.current = currentId;
  const focusNode = (id: string) => {
    const node = rf.getNode(id);
    if (!node) return;
    const w = node.measured?.width ?? (nodeKinds[node.type!]?.size(node.data as GraphNodeData).width ?? 0) * textScale;
    const h = node.measured?.height ?? 0;
    const zoom = rf.getZoom();
    const view = paneHeight / zoom;
    autoFit.current = false;
    void rf.setCenter(node.position.x + w / 2, h <= view ? node.position.y + h / 2 : node.position.y + view / 2 - 24 / zoom, { zoom, duration: 200 });
  };
  const moveGuide = (delta: 1 | -1) => {
    if (!steps.length) return;
    const next = moveStep(steps.length, guideStep, delta, start);
    const target = steps[next]!;
    if (target.place !== undefined && target.place !== place) goTo(target.place, { guideStep: next });
    else {
      pushJump(historyView());
      setGuideStep(next);
      focusNode(target.nodeId);
    }
  };
  const toggleReviewed = () => {
    if (guideStep === null || !chatActions) return;
    void steps[guideStep]!.toggleReviewed?.(chatActions.sessionId).catch((error: Error) => console.error(error));
  };
  const guideRef = useRef({ move: moveGuide, toggleReviewed });
  guideRef.current = { move: moveGuide, toggleReviewed };
  const laidOutKey = useRef("");
  const offsets = useRef(new Map<string, { dx: number; dy: number }>());
  const basePos = useRef(new Map<string, { x: number; y: number }>());

  const sizeOf = (kind: string, id: string): NodeSize => nodeKinds[kind]?.resizable === false ? {} : sizes[id] ?? {};
  // A node with a height of its own scrolls its content, and the wheel scrolls it instead of the canvas.
  const nodeClass = (id: string, kind: string) => [id === currentRef.current && "guide-current", sizeOf(kind, id).height !== undefined && "fixed-height nowheel"].filter(Boolean).join(" ") || undefined;
  const nodeStyle = (n: PlacedNode | GraphNode) => {
    const kind = nodeKinds[n.data.kind]!;
    const size = sizeOf(n.data.kind, n.id);
    const width = kind.resizable === false ? kind.size(n.data).width : size.width ?? (isSatellite(n) ? SATELLITE_WIDTH : kind.size(n.data).width);
    return { width: width * textScale, ...(size.height !== undefined ? { height: size.height * textScale } : {}) };
  };
  const keepPosition = (id: string, position: { x: number; y: number }) => {
    const node = graph.nodes.find((item) => item.id === id);
    if (node?.position || (node && "movable" in node.data && node.data.movable === true)) setFreePosition(id, position);
    else {
      const b = basePos.current.get(id);
      if (b) offsets.current.set(id, { dx: position.x - b.x, dy: position.y - b.y });
    }
  };
  const resized = (id: string, from: ResizeParams, to: ResizeParams) => {
    const size: NodeSize = {};
    if (Math.round(to.width) !== Math.round(from.width)) size.width = to.width / textScale;
    if (Math.round(to.height) !== Math.round(from.height)) size.height = to.height / textScale;
    if (to.x !== from.x || to.y !== from.y) keepPosition(id, { x: to.x, y: to.y });
    if (size.width !== undefined || size.height !== undefined) setSize(id, size);
  };

  const offsetPosition = (id: string, p: { x: number; y: number }) => {
    const o = offsets.current.get(id);
    return o ? { x: p.x + o.dx, y: p.y + o.dy } : p;
  };

  useEffect(() => offsets.current.clear(), [graph]);

  const arrange = (all: { id: string; width: number; height: number }[]) => {
    const free = new Map(shown.nodes.filter((n) => n.position).map((n) => [n.id, n.position!]));
    // Satellites hanging (directly or through other satellites) off a freely placed node sit beside that node.
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
    if (model.stack?.is(shown, place)) {
      const byId = new Map(shown.nodes.map((n) => [n.id, n]));
      return new Map([...model.stack.layout(sized.map((s) => { const n = byId.get(s.id)!; return { ...s, data: n.data, anchors: n.anchors ?? [] }; }), shown.edges), ...free, ...freePlaced]);
    }
    const main = sized.filter((n) => !satelliteAnchors.has(n.id));
    const mainEdges = shown.edges.filter((e) => !satelliteAnchors.has(e.source));
    const layoutEdges = model.layoutEdges?.(shown.nodes, mainEdges) ?? mainEdges;
    const mainPos = layout(main, layoutEdges);
    const rects = new Map(main.map((n) => [n.id, { ...mainPos.get(n.id)!, width: n.width, height: n.height }]));
    const satellites = sized.filter((n) => satelliteAnchors.has(n.id)).map((n) => ({ ...n, anchors: satelliteAnchors.get(n.id)! }));
    return new Map([...mainPos, ...placeSatellites(rects, satellites), ...free, ...freePlaced]);
  };

  const sizeBasis = useRef("");
  // A layout effect, so the new node widths are committed before the frame's ResizeObserver delivery; a passive
  // effect would flush inside that delivery's callback and resize the nodes there.
  useLayoutEffect(() => {
    if (anchor.current && revealedIds.includes(anchor.current)
      && !shown.nodes.some((n) => n.id === anchor.current)) anchor.current = null;
    // A new graph object (every session event) keeps the measured sizes of an unchanged place and text scale, so
    // the view does not jump to estimated positions until the next measurement.
    const basis = `${place}|${textScale}`;
    const keepMeasured = basis === sizeBasis.current;
    sizeBasis.current = basis;
    const measured = new Map(keepMeasured ? rf.getNodes().flatMap((n) => n.measured?.width && n.measured.height ? [[n.id, n.measured] as const] : []) : []);
    const selected = new Set(rf.getNodes().filter((n) => n.selected).map((n) => n.id));
    const sized = shown.nodes.map((n) => {
      const m = measured.get(n.id);
      const kind = nodeKinds[n.data.kind];
      if (!kind) throw new Error(`Unknown node kind: ${n.data.kind}`);
      const estimate = kind.size(n.data);
      const width = isSatellite(n) ? SATELLITE_WIDTH : estimate.width;
      const size = sizeOf(n.data.kind, n.id);
      return { id: n.id, width: size.width !== undefined ? size.width * textScale : m?.width ?? width * textScale, height: m?.height ?? (size.height ?? estimate.height) * textScale };
    });
    const pos = arrange(sized);
    basePos.current = pos;
    laidOutKey.current = "";
    setNodes(shown.nodes.map((n) => ({
      id: n.id,
      type: n.data.kind,
      data: { ...n.data, sessionId: state.session.id },
      position: offsetPosition(n.id, pos.get(n.id)!),
      ...(measured.has(n.id) ? { measured: measured.get(n.id) } : {}),
      style: nodeStyle(n),
      className: nodeClass(n.id, n.data.kind),
      selected: selected.has(n.id),
      draggable: true,
      dragHandle: ".title",
    })));
  }, [shown, place, textScale, setNodes, state.session.id, rf, sizes]);

  useEffect(() => {
    setNodes((ns) => ns.map((n) => ({ ...n, className: nodeClass(n.id, n.type!) })));
  }, [currentId, setNodes]);

  const sizeKey = nodes.map((n) => `${n.id}:${n.measured?.width ?? 0}x${n.measured?.height ?? 0}`).join("|");
  useEffect(() => {
    if (nodes.length !== shown.nodes.length || nodes.some((n) => !shown.nodes.some((g) => g.id === n.id))) return;
    if (nodes.length === 0 || nodes.some((n) => !n.measured?.height)) return;
    const key = `${sizeKey}#${JSON.stringify(sizes)}`;
    if (key === laidOutKey.current) return;
    laidOutKey.current = key;
    const pos = arrange(nodes.map((n) => ({ id: n.id, width: sizeOf(n.type!, n.id).width !== undefined ? sizeOf(n.type!, n.id).width! * textScale : n.measured!.width!, height: n.measured!.height! })));
    basePos.current = pos;
    setNodes((ns) => ns.map((n) => ({ ...n, position: offsetPosition(n.id, pos.get(n.id)!) })));
    const draftToFocus = focusDraft.current;
    if (draftToFocus && (nodes.some((n) => n.id === draftToFocus) || graph.nodes.some((node) => hostedThreads(node.data)?.some((thread) => thread.draftId === draftToFocus)))) {
      focusDraft.current = null;
      requestAnimationFrame(() => {
        const box = container.current?.querySelector<HTMLElement>(`[data-testid="chat-${CSS.escape(draftToFocus)}"]`);
        const textarea = box?.querySelector<HTMLTextAreaElement>("textarea");
        if (box && graph.nodes.some((node) => hostedThreads(node.data)?.some((thread) => thread.draftId === draftToFocus))) {
          const rect = box.getBoundingClientRect();
          const point = rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
          void rf.setCenter(point.x, point.y, { zoom: rf.getZoom() });
        }
        textarea?.focus({ preventScroll: true });
      });
    }
    const pending = anchorOnResize.current && nodes.find((n) => n.id === anchorOnResize.current!.id);
    if (pending && pending.measured!.height !== anchorOnResize.current!.height) {
      anchor.current = pending.id;
      anchorOnResize.current = null;
    }
    const a = anchor.current && nodes.find((n) => n.id === anchor.current);
    if (a) {
      const p = offsetPosition(a.id, pos.get(a.id)!);
      const centered = rf.setCenter(p.x + a.measured!.width! / 2, p.y + a.measured!.height! / 2, { zoom: rf.getZoom() });
      anchor.current = null;
      autoFit.current = false;
      // The layout has moved the anchor's node, so a focused row in it is centered again.
      if (focusedRowRef.current) focusCentered.current = false;
      if (selectAfterLayout.current === a.id) {
        const id = a.id;
        selectAfterLayout.current = null;
        setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
      }
      if (savePlaceView.current) {
        savePlaceView.current = false;
        void centered.then(persistView);
      }
    } else if (autoFit.current) {
      if (storedView.current) {
        const view = storedView.current;
        storedView.current = null;
        autoFit.current = false;
        void rf.setViewport({ x: view.x, y: view.y, zoom: view.zoom });
      } else {
        const fitFloor = fitMinZoom(textScale);
        void rf.fitView({ maxZoom: Math.max(1, fitFloor.minZoom ?? 0), ...fitFloor }).then(() => { if (savePlaceView.current && autoFit.current) persistView(); });
      }
    }
  }, [sizeKey, nodes, rf, setNodes, shown, textScale, sizes, graph]);

  useEffect(() => {
    if (autoFit.current) return;
    const { x, y, zoom } = rf.getViewport();
    saveViewState(viewKey, { x, y, zoom, place, guideStep });
    saveHistoryView({ x, y, zoom, place, guideStep, focusedRow, label: labelRef.current });
  }, [place, guideStep, focusedRow, rf, viewKey]);

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
    const start = state.artifacts.findLast((artifact) => artifact.type === "WorkflowStart");
    if (!start || !chatActions) return;
    const doubleClick = (event: MouseEvent) => {
      // Nodes render inside the pane, so only a hit on the pane element itself is empty canvas.
      if (!(event.target instanceof Element) || !event.target.classList.contains("react-flow__pane")) return;
      const id = `draft-${crypto.randomUUID()}`;
      const position = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setFreePosition(id, position);
      focusDraft.current = id;
      onOpenAside({ id, anchor: start.id, aside: true }, position);
    };
    el.addEventListener("dblclick", doubleClick);
    return () => el.removeEventListener("dblclick", doubleClick);
  }, [state.artifacts, chatActions, rf, setFreePosition, onOpenAside]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let frame = 0;
    const click = (event: MouseEvent) => {
      if (!getSelection()?.isCollapsed) return;
      const id = quoteAt(event.clientX, event.clientY);
      if (!id || !collapsed.has(id)) return;
      const host = graph.nodes.find((node) => hostedThreads(node.data)?.some((thread) => (thread.threadId ?? thread.draftId) === id));
      if (host) reveal(host.id, id);
      else {
        anchor.current = id;
        toggle(id);
      }
    };
    const move = (event: PointerEvent) => {
      const id = quoteAt(event.clientX, event.clientY);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setHoveredQuote(id);
        el.classList.toggle("over-collapsed-quote", id !== null && collapsed.has(id));
      });
    };
    const stopAutoFit = () => { autoFit.current = false; };
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
      const id = target.closest<HTMLElement>("[data-testid^='chat-']")?.dataset.testid?.slice(5) ?? target.closest(".react-flow__node")?.getAttribute("data-id") ?? null;
      return id && quotedBoxIds.has(id) ? id : null;
    };
    const over = (event: PointerEvent) => setHoveredChat(chatAt(event.target));
    const out = (event: PointerEvent) => {
      if (chatAt(event.relatedTarget)) return;
      setHoveredChat(null);
    };
    const focus = (event: FocusEvent) => setFocusedChat(chatAt(event.target));
    const selectFocusedNode = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const node = event.target.closest<HTMLElement>(".react-flow__node[data-id]");
      const id = node?.getAttribute("data-id");
      if (!id) return;
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    };
    const blur = (event: FocusEvent) => {
      if (chatAt(event.relatedTarget)) return;
      setFocusedChat(null);
    };
    el.addEventListener("pointerover", over);
    el.addEventListener("pointerout", out);
    el.addEventListener("focusin", focus);
    el.addEventListener("focusin", selectFocusedNode);
    el.addEventListener("focusout", blur);
    return () => {
      el.removeEventListener("pointerover", over);
      el.removeEventListener("pointerout", out);
      el.removeEventListener("focusin", focus);
      el.removeEventListener("focusin", selectFocusedNode);
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
      const vp = rf.getViewport();
      void rf.setViewport({ ...vp, x: vp.x - step.x, y: vp.y - step.y });
    };
    el.addEventListener("keydown", keydown);
    return () => el.removeEventListener("keydown", keydown);
  }, [rf]);

  const persistView = () => {
    const view = { ...rf.getViewport(), place: placeRef.current, guideStep: guideStepRef.current };
    saveViewState(viewKey, view);
    saveHistoryView({ ...view, focusedRow: focusedRowRef.current, label: labelRef.current });
  };
  const onMoveEnd = (_: unknown, vp: Viewport) => {
    if (autoFit.current) return;
    saveViewState(viewKey, { ...vp, place, guideStep });
    saveHistoryView({ ...vp, place, guideStep, focusedRow, label: labelRef.current });
  };
  const historyView = (): HistoryView => ({ ...rf.getViewport(), place: placeRef.current, guideStep, focusedRow, label: labelRef.current });
  useViewHistory(routeContext?.sessionId ?? null, (view, urlPlace) => {
    anchor.current = null;
    storedView.current = null;
    const target = view ? view.place : places ? urlPlace !== null && places.graph(graph, urlPlace) ? urlPlace : places.initial(graph) : null;
    if (target !== placeRef.current) {
      placeRef.current = target;
      setPlaceState(target);
    }
    autoFit.current = view === null;
    setGuideStep(view ? view.guideStep : target === null ? null : guideByPlace.current.get(target) ?? stepOfPlace(target));
    focusCentered.current = true;
    setFocusedRow(view?.focusedRow ?? null);
    if (view) void rf.setViewport({ x: view.x, y: view.y, zoom: view.zoom });
  });

  const stepOfPlace = (target: string) => {
    const index = model.guide?.(graph, target).findIndex((step) => step.place === target) ?? -1;
    return index < 0 ? null : index;
  };
  // Switches the place as one history entry (`from` is the view that Back returns to); then fits the new place, or
  // centers and selects `center` in it.
  const goTo = (target: string, how: { guideStep?: number | null; center?: string; select?: boolean }, from: HistoryView = historyView()) => {
    if (placeRef.current !== null) guideByPlace.current.set(placeRef.current, guideStep);
    pushJump(from, routeContext ? routeUrl({ kind: "session", sessionId: routeContext.sessionId, place: target }) : undefined);
    storedView.current = null;
    placeRef.current = target;
    setPlaceState(target);
    setGuideStep(how.guideStep !== undefined ? how.guideStep : guideByPlace.current.get(target) ?? stepOfPlace(target));
    savePlaceView.current = true;
    anchor.current = how.center ?? null;
    selectAfterLayout.current = how.select ? how.center ?? null : null;
    autoFit.current = how.center === undefined;
  };
  const openNode = async (nodeId: string) => {
    const target = places && place !== null ? places.open(graph, place, nodeId) : null;
    const node = rf.getNode(nodeId);
    if (!target || !node || opening.current) return;
    opening.current = true;
    const from = historyView();
    const zoom = Math.min(2, rf.getZoom() * 2);
    autoFit.current = false;
    try {
      await Promise.race([rf.setCenter(node.position.x + (node.measured?.width ?? 0) / 2, node.position.y + (node.measured?.height ?? 0) / 2, { zoom, duration: 200 }), new Promise((resolve) => setTimeout(resolve, 400))]);
      goTo(target, {}, from);
    } finally {
      opening.current = false;
    }
  };
  const ascend = (target?: string) => {
    if (!places || place === null) return;
    for (let at = place; at !== target;) {
      const up = places.up(graph, at);
      if (!up) return;
      if (target === undefined || up.place === target) return goTo(up.place, { center: up.nodeId, select: true });
      at = up.place;
    }
  };
  const placeKeys = (event: ReactKeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !places) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable], dialog")) return;
    if (event.key === "Backspace") {
      event.preventDefault();
      ascend();
    } else if (event.key === "Enter" && !(event.target instanceof Element && event.target.closest("button, a, summary"))) {
      const selected = rf.getNodes().find((n) => n.selected);
      if (selected) void openNode(selected.id);
    }
  };
  const crumbs = useMemo(() => places && place !== null ? places.crumbs(graph, place) : [], [places, graph, place]);
  const openPlace = useMemo(() => ({ can: (nodeId: string) => !!places && place !== null && places.open(graph, place, nodeId) !== null, open: (nodeId: string) => void openNode(nodeId) }), [places, graph, place]);
  const selectedId = nodes.find((n) => n.selected)?.id;
  const focusId = focusNodeId ?? selectedId;
  const focus = model.focusLabel && focusId ? model.focusLabel(placed, focusId, focusNodeId ? focusedRow : null) : null;
  const title = useMemo(() => places ? [focus, ...crumbs.map((crumb) => crumb.label).reverse()].filter((part): part is string => !!part) : [], [places, focus, crumbs]);
  const titleKey = JSON.stringify(title);
  labelRef.current = title.length ? title.join(" · ") : state.session.title;
  useEffect(() => {
    if (!routeContext) return;
    routeContext.setTitleParts(title);
    return () => routeContext.setTitleParts([]);
  }, [routeContext, titleKey]);
  useEffect(() => {
    if (routeContext && !autoFit.current) saveHistoryView(historyView());
  }, [titleKey]);
  const centerFocus = () => {
    if (focusNodeId && focusedRow) {
      focusCentered.current = false;
      setFocusedRow({ ...focusedRow });
    } else if (focusId) focusNode(focusId);
  };

  const reset = () => {
    offsets.current.clear();
    clearNodeSizes();
    setNodes((ns) => ns.map((n) => {
      const p = basePos.current.get(n.id);
      return p ? { ...n, position: p } : n;
    }));
  };

  const reveal = (nodeId: string, collapseId: string, target?: string) => {
    if (places && target !== undefined && target !== placeRef.current) goTo(target, { center: nodeId });
    else {
      pushJump(historyView());
      const height = rf.getNode(nodeId)?.measured?.height;
      if (collapsed.has(collapseId) && height !== undefined) anchorOnResize.current = { id: nodeId, height };
      else anchor.current = nodeId;
    }
    expandExplicitly(collapseId);
  };
  const focusRow = (row: FocusedRow) => {
    focusCentered.current = false;
    setFocusedRow(row);
  };
  const Provider = model.Provider ?? NO_PROVIDER;

  return (
    <ChatActionsContext.Provider value={chatActions}>
    <Provider state={state} graph={graph} readOnly={!models} reveal={reveal} focusRow={focusRow}><div ref={container} className="canvas" data-place={place ?? undefined} tabIndex={-1} style={{ width: "100%", height: "100%" }} onKeyDown={placeKeys} onClickCapture={(event) => { if (!(event.target instanceof Element) || !event.target.closest("button.sequence-step, button.focus-crumb")) setFocusedRow(null); }}>
    {steps.length > 0 && <GuideBar steps={steps} step={guideStep} start={start} canToggle={!!chatActions} onMove={moveGuide} onToggle={toggleReviewed} />}
    <ClosedContext.Provider value={closedValue}>
    <CollapseContext.Provider value={{ collapsed, toggle, reveal }}>
      <OpenPlaceContext.Provider value={openPlace}>
      <ResizeContext.Provider value={{ textScale, resized }}>
      <div className="canvas-layout">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onMoveEnd={onMoveEnd}
        onNodeDoubleClick={(event, node) => { if (!(event.target instanceof Element) || !event.target.closest("button, a, input, textarea, select, summary")) void openNode(node.id); }}
        nodesDraggable
        nodesConnectable={false}
        zoomOnDoubleClick={false}
        selectNodesOnDrag
        nodeDragThreshold={1}
        elevateNodesOnSelect
        onNodeDragStop={(_, node) => keepPosition(node.id, node.position)}
        panOnScroll
        disableKeyboardA11y
        minZoom={0.1}
        maxZoom={2}
        colorMode={colorMode}
      >
        <Background />
        <Controls showInteractive={false} onZoomIn={() => { autoFit.current = false; }} onZoomOut={() => { autoFit.current = false; }} />
        {(crumbs.length > 0 || focus) && <Panel position="top-left" className="place-panel"><IconButton className="place-up" data-testid="place-up" label="Up one level" disabled={!places || place === null || !places.up(graph, place)} onClick={() => ascend()}>↑</IconButton>{routeContext && <RecentPlaces sessionId={routeContext.sessionId} />}{crumbs.length > 0 && <nav aria-label="Place" data-testid="place-crumbs" className="place-crumbs">{crumbs.map((crumb, index) => <Fragment key={crumb.place}>{index > 0 && <span className="sep" aria-hidden="true">›</span>}{index < crumbs.length - 1 ? <button type="button" onClick={() => ascend(crumb.place)}>{crumb.label}</button> : <span aria-current="page">{crumb.label}</span>}</Fragment>)}</nav>}{focus && <>{crumbs.length > 0 && <span className="sep" aria-hidden="true">›</span>}<button type="button" data-testid="focus-crumb" className="focus-crumb" title={focus} onClick={centerFocus}>{focus}</button></>}</Panel>}
        <Panel position="top-right">{model.layers && <span className="layers" role="group" aria-label="Show on canvas">{model.layers.list.map((layer) => <button key={layer.id} type="button" aria-pressed={!hiddenLayers.has(layer.id)} onClick={() => toggleLayer(layer.id)}>{layer.label}</button>)}</span>}{model.PanelExtras && <model.PanelExtras />}<button onClick={expandAll}>Expand all</button><button onClick={reset}>Reset layout</button></Panel>
      </ReactFlow>
      <MiniMap
        position="top-right"
        className="canvas-minimap"
        style={{ position: "relative", width: 140, height: paneHeight, margin: 0, flexShrink: 0 }}
        pannable
        zoomable
        nodeColor={(n) => {
          const kind = n.type ? nodeKinds[n.type] : null;
          if (!kind) throw new Error(`Unknown node type: ${n.type}`);
          return kind.minimapColor;
        }}
        nodeComponent={minimapNode}
        bgColor="var(--minimap-bg)"
        maskColor="var(--minimap-mask)"
      />
      </div>
      </ResizeContext.Provider>
      </OpenPlaceContext.Provider>
    </CollapseContext.Provider>
    </ClosedContext.Provider>
    </div></Provider>
    </ChatActionsContext.Provider>
  );
}
