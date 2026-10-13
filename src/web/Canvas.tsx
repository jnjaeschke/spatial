import { Fragment, createContext, createElement, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  Background, Controls, MiniMap, NodeResizer, Panel, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, useStore,
  type Edge, type MiniMapNodeProps, type Node, type NodeProps, type ResizeParams, type Viewport,
} from "@xyflow/react";
import type { ModelsResponse, SessionState } from "../shared/types.ts";
import { ChatActionsContext, type Draft } from "./chat-context.ts";
import { closeGraph, fitMinZoom, hostedThreads, sessionGraph, visibleGraph, isSatellite, SATELLITE_WIDTH, type ChatNodeData, type Graph, type GraphEdge, type GraphNode, type GraphNodeData, type PlacedNode } from "./graph.ts";
import { arrangeCanvas, nodeWidth } from "./canvas-layout.ts";
import { useQuoteHighlights } from "./quote-highlights.ts";
import { CollapseContext, useCollapsed } from "./collapse.ts";
import { ClosedContext, useClosed } from "./closed.ts";
import { UndoClose } from "./UndoClose.tsx";
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
import { IconButton, InlineStatesContext, NodeKindsContext } from "./plugin-api.ts";
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
const NO_QUOTES = (_data: GraphNodeData): { id: string; kind: string; anchor: string; quote: string; lines?: ChatNodeData["lines"] }[] => [];
const MIN_NODE_WIDTH = 240;
const NO_PROVIDER: ComponentType<CanvasProviderProps> = ({ children }) => <>{children}</>;

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
export interface CanvasProps { state: SessionState; model: CanvasModel; /** Key of the canvas's client view state (viewport, free positions, sizes, collapsed and closed nodes); default the session id. */ viewKey?: string; closed?: ReturnType<typeof useClosed>; models?: ModelsResponse | null; readOnly?: boolean; drafts?: Draft[]; onSent?(draftId: string, taskId: string): void; onDiscard?(draftId: string): void; onOpenAside?(draft: Draft, position: { x: number; y: number }): void }
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

function CanvasInner({ state, model, viewKey: viewKeyProp, closed: sharedClosed, models = null, readOnly = false, drafts = NO_DRAFTS, onSent = () => {}, onDiscard = () => {}, onOpenAside = () => {} }: CanvasProps) {
  const viewKey = viewKeyProp ?? state.session.id;
  const nodeKinds = useContext(NodeKindsContext);
  const inlineStates = useContext(InlineStatesContext);
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
  const chatActions = useMemo(() => models && !readOnly ? { models, sessionId: state.session.id, tasks: state.tasks, onSent, onDiscard: (id: string) => { removeFreePosition(id); onDiscard(id); }, onNote: (draftId: string, noteId: string) => { moveFreePosition(draftId, noteId); onDiscard(draftId); } } : null,
    [models, readOnly, state.session.id, state.tasks, onSent, onDiscard, removeFreePosition, moveFreePosition]);
  const ownClosed = useClosed(viewKey);
  const { closed: closedIds, close, reopen } = sharedClosed ?? ownClosed;
  const { hidden: hiddenLayers, toggle: toggleLayer } = useLayers(model.layers?.list.map((layer) => layer.id) ?? []);
  const { graph, closedOn } = useMemo(() => {
    const g = sessionGraph(model.graph, state, drafts, freePositions);
    if (!g) throw new Error("Canvas needs a session graph");
    return closeGraph(model.layers && hiddenLayers.size ? model.layers.hide(g, hiddenLayers) : g, closedIds);
  }, [model, state, drafts, freePositions, closedIds, hiddenLayers]);
  const [lastClosed, setLastClosed] = useState<{ id: string; seq: number } | null>(null);
  const closeWithUndo = useCallback((id: string) => { close(id); setLastClosed((current) => ({ id, seq: (current?.seq ?? 0) + 1 })); }, [close]);
  const endUndo = useCallback(() => setLastClosed(null), []);
  const closedValue = useMemo(() => ({ close: closeWithUndo, reopen, closedOn }), [closeWithUndo, reopen, closedOn]);
  const lastKind = lastClosed && [...closedOn.values()].flat().find((item) => item.id === lastClosed.id)?.kind;
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
  const shownNodeIds = useMemo(() => new Set(shown.nodes.map((node) => node.id)), [shown]);
  const { quoteAt } = useQuoteHighlights({
    nodes: graph.nodes, quoteEntries: model.quotes ?? NO_QUOTES, container, shownNodeIds, collapsed,
  });
  const satelliteAnchors = useMemo(() => new Map(shown.nodes.filter(isSatellite).map((n) => [n.id, n.anchors ?? []])), [shown]);
  const edges = useMemo<Edge[]>(() => shown.edges.map(({ title, ...e }) => {
    const edge = title ? { ...e, label: <>{e.label}<title>{title}</title></> } : e;
    return satelliteAnchors.has(edge.source) ? { ...edge, type: "straight", style: { strokeDasharray: "4 4" } } : { ...edge, type: "smoothstep" };
  }), [shown, satelliteAnchors]);
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
  const nodeClass = (id: string, kind: string) => [id === currentRef.current && "guide-current", sizeOf(kind, id).height !== undefined && "fixed-height"].filter(Boolean).join(" ") || undefined;
  const nodeStyle = (n: PlacedNode | GraphNode) => {
    const kind = nodeKinds[n.data.kind]!;
    const size = sizeOf(n.data.kind, n.id);
    const width = nodeWidth({ resizable: kind.resizable !== false, defaultWidth: kind.size(n.data).width, storedWidth: size.width, satellite: isSatellite(n), satelliteWidth: SATELLITE_WIDTH });
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

  // The wheel scrolls what it is over inside a node while that can still scroll in the wheel's direction, and pans the canvas otherwise; stopping the event before React Flow sees it leaves the native scroll.
  const wheelScope = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scope = wheelScope.current;
    if (!scope) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || !(event.target instanceof Element)) return;
      for (let el: Element | null = event.target; el && el !== scope && !el.classList.contains("react-flow__node"); el = el.parentElement) {
        if (canScroll(el, event)) { event.stopPropagation(); return; }
      }
    };
    scope.addEventListener("wheel", onWheel, { capture: true, passive: true });
    return () => scope.removeEventListener("wheel", onWheel, { capture: true });
  }, []);
  useEffect(() => offsets.current.clear(), [graph]);

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
      const size = sizeOf(n.data.kind, n.id);
      const width = nodeWidth({ resizable: kind.resizable !== false, defaultWidth: m?.width ?? estimate.width * textScale, storedWidth: size.width === undefined ? undefined : size.width * textScale, satellite: !m && isSatellite(n), satelliteWidth: SATELLITE_WIDTH * textScale });
      return { id: n.id, width, height: m?.height ?? (size.height ?? estimate.height) * textScale };
    });
    const pos = arrangeCanvas({ all: sized, nodes: shown.nodes, edges: shown.edges, satelliteAnchors, stack: model.stack, graph: shown, place, layoutEdges: model.layoutEdges });
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
    const all = nodes.map((n) => {
      const kind = nodeKinds[n.type!]!;
      const size = sizeOf(n.type!, n.id);
      return { id: n.id, width: nodeWidth({ resizable: kind.resizable !== false, defaultWidth: n.measured!.width!, storedWidth: size.width === undefined ? undefined : size.width * textScale, satellite: false, satelliteWidth: 0 }), height: n.measured!.height! };
    });
    const pos = arrangeCanvas({ all, nodes: shown.nodes, edges: shown.edges, satelliteAnchors, stack: model.stack, graph: shown, place, layoutEdges: model.layoutEdges });
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
        void centered.then(() => persistView());
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
    persistView({ x, y, zoom }, place, guideStep, focusedRow);
  }, [place, guideStep, focusedRow, rf, viewKey]);

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
    const click = (event: MouseEvent) => {
      if (!getSelection()?.isCollapsed) return;
      const id = quoteAt(event.clientX, event.clientY);
      if (!id) return;
      if (!collapsed.has(id)) {
        if (!graph.nodes.some((node) => node.id === id)) inlineStates?.set(id, "expanded");
        return;
      }
      const host = graph.nodes.find((node) => hostedThreads(node.data)?.some((thread) => (thread.threadId ?? thread.draftId) === id));
      if (host) reveal(host.id, id);
      else {
        anchor.current = id;
        toggle(id);
      }
    };
    const stopAutoFit = () => { autoFit.current = false; };
    el.addEventListener("click", click);
    el.addEventListener("pointerdown", stopAutoFit, true);
    el.addEventListener("wheel", stopAutoFit, true);
    return () => {
      el.removeEventListener("click", click);
      el.removeEventListener("pointerdown", stopAutoFit, true);
      el.removeEventListener("wheel", stopAutoFit, true);
    };
  }, [collapsed, toggle, inlineStates, graph]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const selectFocusedNode = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const node = event.target.closest<HTMLElement>(".react-flow__node[data-id]");
      const id = node?.getAttribute("data-id");
      if (!id) return;
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    };
    el.addEventListener("focusin", selectFocusedNode);
    return () => {
      el.removeEventListener("focusin", selectFocusedNode);
    };
  }, []);

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

  const persistView = (viewport = rf.getViewport(), currentPlace = placeRef.current, currentGuideStep = guideStepRef.current, currentFocusedRow = focusedRowRef.current) => {
    const view = { ...viewport, place: currentPlace, guideStep: currentGuideStep };
    saveViewState(viewKey, view);
    saveHistoryView({ ...view, focusedRow: currentFocusedRow, label: labelRef.current });
  };
  const onMoveEnd = (_: unknown, vp: Viewport) => {
    if (autoFit.current) return;
    persistView(vp, place, guideStep, focusedRow);
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
    <Provider state={state} graph={graph} readOnly={!chatActions} reveal={reveal} focusRow={focusRow}><div ref={container} className="canvas" data-place={place ?? undefined} tabIndex={-1} style={{ width: "100%", height: "100%" }} onKeyDown={placeKeys} onClickCapture={(event) => { if (!(event.target instanceof Element) || !event.target.closest("button.sequence-step, button.focus-crumb")) setFocusedRow(null); }}>
    {steps.length > 0 && <GuideBar steps={steps} step={guideStep} start={start} canToggle={!!chatActions} onMove={moveGuide} onToggle={toggleReviewed} />}
    <ClosedContext.Provider value={closedValue}>
    <CollapseContext.Provider value={{ collapsed, toggle, reveal }}>
      <OpenPlaceContext.Provider value={openPlace}>
      <ResizeContext.Provider value={{ textScale, resized }}>
      <div className="canvas-layout" ref={wheelScope}>
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
      {lastClosed && closedIds.has(lastClosed.id) && <UndoClose key={lastClosed.seq} label={`Closed the ${lastKind ?? "item"}`} onUndo={() => reopen([lastClosed.id])} onDone={endUndo} />}
    </ClosedContext.Provider>
    </div></Provider>
    </ChatActionsContext.Provider>
  );
}

/** Whether `el` scrolls and can still move in the direction of `event`'s main axis. */
function canScroll(el: Element, event: WheelEvent): boolean {
  const style = getComputedStyle(el);
  const vertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
  const overflow = vertical ? style.overflowY : style.overflowX;
  if (overflow !== "auto" && overflow !== "scroll") return false;
  const delta = vertical ? event.deltaY : event.deltaX;
  const [position, size, view] = vertical ? [el.scrollTop, el.scrollHeight, el.clientHeight] : [el.scrollLeft, el.scrollWidth, el.clientWidth];
  return delta < 0 ? position > 0 : delta > 0 && position + view < size - 1;
}
