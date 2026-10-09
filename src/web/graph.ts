import dagre from "@dagrejs/dagre";
import type { Artifact, ChatMessageData, ChatThreadData, DecisionData, DiffFile, Hunk, Id, McpServerData, NoteData, Ref, RevisionData, SessionState, WorkflowStartData } from "../shared/types.ts";
import { revisionsOf } from "../shared/revisions.ts";
import type { Draft } from "./chat-context.ts";
import type { FreePosition } from "./free-positions.ts";

export type ZoomLevel = "patch" | "concept" | "code";

const ZOOM_THRESHOLDS = { patchToConcept: 0.6, conceptToCode: 1.2, codeToConcept: 0.9, conceptToPatch: 0.45 };

export function zoomLevel(zoom: number, current: ZoomLevel): ZoomLevel {
  if (current === "patch") return zoom >= ZOOM_THRESHOLDS.conceptToCode ? "code" : zoom >= ZOOM_THRESHOLDS.patchToConcept ? "concept" : "patch";
  if (current === "concept") return zoom >= ZOOM_THRESHOLDS.conceptToCode ? "code" : zoom < ZOOM_THRESHOLDS.conceptToPatch ? "patch" : "concept";
  return zoom < ZOOM_THRESHOLDS.conceptToPatch ? "patch" : zoom < ZOOM_THRESHOLDS.codeToConcept ? "concept" : "code";
}

/** Highest zoom that still shows each level. Fitting the view stays below it, so a fit never switches to a level with wider nodes. */
export const LEVEL_MAX_ZOOM: Record<ZoomLevel, number> = { patch: 0.59, concept: 1.19, code: 2 };
/** Lowest zoom that keeps each level once it is shown. A level set without zooming (reveal) must zoom to at least this, or the next move drops back. */
export const LEVEL_MIN_ZOOM: Record<ZoomLevel, number> = { patch: 0, concept: ZOOM_THRESHOLDS.conceptToPatch, code: ZOOM_THRESHOLDS.codeToConcept };

export const NODE_WIDTH: Record<ZoomLevel, number> = { patch: 360, concept: 480, code: 760 };
/** Width of spec and chat satellites at every zoom level. */
export const SATELLITE_WIDTH = 420;

export interface NoteNodeData { kind: "note"; body: string }
export interface ChatNodeData {
  kind: "chat";
  anchor: Ref;
  quote?: string;
  lines?: ChatThreadData["lines"];
  diffId: string;
  hunks: { file: DiffFile; hunk: Hunk }[];
  threadId: string | null;
  draftId: string | null;
  /** Task of the turn that created the thread (or that the draft sent); later turns carry `threadId` in their input. */
  taskId: string | null;
  aside?: boolean;
  /** Collapsing the node leaves only a highlight of its quote. */
  foldsToQuote?: boolean;
  messages: Artifact<ChatMessageData>[];
  revisions: Record<Id, RevisionData[]>;
  mcpRequests: string[];
  /** Current review diagrams created by each assistant message. */
  diagramsByMessage?: Record<Id, Id[]>;
}
export type HostedThread = Omit<ChatNodeData, "kind" | "aside" | "foldsToQuote"> & { anchor: Ref; quote?: string; lines?: ChatThreadData["lines"]; draftId: string | null };
export interface ConversationNodeData extends Pick<ChatNodeData, "anchor" | "diffId" | "hunks" | "threadId" | "draftId" | "taskId" | "messages" | "revisions" | "mcpRequests" | "diagramsByMessage"> {
  kind: "conversation";
  title: string;
  /** The request; shown until the first turn has created the thread. */
  prompt: string;
}

/** The open decision of the session, drawn beside the root node. */
export interface DecisionNodeData { kind: "decision"; sessionId: string; repoDir: string; decision: Artifact<DecisionData> }

export type CoreNodeData = NoteNodeData | ChatNodeData | ConversationNodeData | DecisionNodeData;
/**
 * Data of a node kind a plugin registers. Core reads only the optional fields it documents:
 * `threads` (a `HostedThread[]` hosted inside the node), `quote` with `foldsToQuote`, and `closable`
 * (the node disappears while its id is closed).
 */
export type PluginNodeData = { kind: string; [key: string]: unknown };
export type GraphNodeData = CoreNodeData | PluginNodeData;
export interface GraphNode { id: string; data: GraphNodeData; anchors?: string[]; position?: FreePosition }
/** A node with its size, as a layout places it; `dy` offsets a satellite below its anchor's top. */
export interface PlacedNode { id: string; data: GraphNodeData; width: number; height: number; anchors?: string[]; dy?: number }
export interface GraphEdge { id: string; source: string; target: string }
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export const isCoreKind = <K extends CoreNodeData["kind"]>(data: GraphNodeData, kind: K): data is Extract<CoreNodeData, { kind: K }> => data.kind === kind;

/** The threads hosted inside a node, or null when its data has none. */
export function hostedThreads(data: GraphNodeData): HostedThread[] | null {
  return "threads" in data && Array.isArray(data.threads) ? data.threads as HostedThread[] : null;
}

/** The graph without collapsed quoted satellites (chat threads, findings): they live on as a highlight of their quote. */
export function visibleGraph(g: Graph, collapsed: ReadonlySet<string>): Graph {
  const hidden = new Set(g.nodes.filter((n) => "foldsToQuote" in n.data && n.data.foldsToQuote === true && "quote" in n.data && n.data.quote && collapsed.has(n.id)).map((n) => n.id));
  return { nodes: g.nodes.filter((n) => !hidden.has(n.id)), edges: g.edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)) };
}

export interface ClosedItem { id: string; kind: "chat" | "note" }

/** Adds to `gone` every node whose anchors are all gone. */
export function cascade(g: Graph, gone: Set<string>): void {
  for (let grew = gone.size > 0; grew;) {
    grew = false;
    for (const n of g.nodes) if (!gone.has(n.id) && n.anchors?.length && n.anchors.every((a) => gone.has(a))) { gone.add(n.id); grew = true; }
  }
}

/** The graph without closed chats, notes and closable nodes, and per host node the closed chats and notes it can reopen. Nodes anchored only on closed nodes close with them. */
export function closeGraph(g: Graph, closed: ReadonlySet<string>): { graph: Graph; closedOn: Map<string, ClosedItem[]> } {
  const closedOn = new Map<string, ClosedItem[]>();
  const addClosed = (host: string, id: string, kind: ClosedItem["kind"] = "chat") => closedOn.set(host, [...(closedOn.get(host) ?? []), { id, kind }]);
  const gone = new Set<string>();
  for (const n of g.nodes) {
    if (!closed.has(n.id)) continue;
    if ("closable" in n.data && n.data.closable === true) gone.add(n.id);
    if (isCoreKind(n.data, "chat")) { gone.add(n.id); addClosed(n.anchors![0]!, n.id); }
    if (n.data.kind === "note") { gone.add(n.id); addClosed(n.anchors![0]!, n.id, "note"); }
  }
  cascade(g, gone);
  const closeId = (thread: HostedThread) => thread.threadId ?? thread.draftId;
  const isClosed = (thread: HostedThread) => { const id = closeId(thread); return id !== null && closed.has(id); };
  const nodes = g.nodes.filter((n) => !gone.has(n.id)).map((n) => {
    const threads = hostedThreads(n.data);
    if (!threads?.some(isClosed)) return n;
    for (const thread of threads) if (isClosed(thread)) addClosed(n.id, closeId(thread)!);
    return { ...n, data: { ...n.data, threads: threads.filter((thread) => !isClosed(thread)) } };
  });
  return { graph: { nodes, edges: g.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)) }, closedOn };
}

/** Anchored nodes sit beside what they hang off, unless the user placed them freely; free notes stay satellites. */
export const isSatellite = (node: GraphNode) => !!node.anchors?.length && (!node.position || node.data.kind === "note");

export const latestStart = (state: SessionState) => state.artifacts.findLast((a) => a.type === "WorkflowStart") as Artifact<WorkflowStartData> | undefined;
export const rootThread = (state: SessionState, startId: string) => (state.artifacts.filter((a) => a.type === "ChatThread") as Artifact<ChatThreadData>[]).find((t) => t.data.anchor === startId && !t.data.aside);

export function conversationNode(state: SessionState, start: Artifact<WorkflowStartData>, root: Artifact<ChatThreadData> | undefined, anchors?: string[]): GraphNode {
  return { id: start.id, ...(anchors ? { anchors } : {}), data: {
    kind: "conversation", title: state.session.title, prompt: start.data.prompt || `/${start.data.workflow}`, anchor: start.id, diffId: "", hunks: [], draftId: null,
    ...(root ? threadContent(state, root) : { threadId: null, taskId: null, messages: [], revisions: {}, mcpRequests: [] }),
  } };
}

function mcpRequestsFor(state: SessionState, threadId: string): string[] {
  const linked = state.links.filter((link) => link.kind === "about" && link.to === threadId)
    .map((link) => state.artifacts.find((artifact) => artifact.id === link.from))
    .filter((artifact): artifact is Artifact<McpServerData> => !!artifact && (artifact.type === "McpServerRequest" || artifact.type === "McpServerEnabled"));
  const enabled = new Set(linked.filter((artifact) => artifact.type === "McpServerEnabled").map((artifact) => artifact.data.server));
  return [...new Set(linked.filter((artifact) => artifact.type === "McpServerRequest")
    .map((artifact) => artifact.data.server).filter((server) => !enabled.has(server)))];
}

export function threadContent(state: SessionState, thread: Artifact<ChatThreadData>, diagramsByMessage?: Record<Id, Id[]>) {
  const messages = state.links.filter((l) => l.kind === "reply" && l.to === thread.id)
    .map((l) => state.artifacts.find((a) => a.id === l.from))
    .filter((a): a is Artifact<ChatMessageData> => !!a);
  const revisions = Object.fromEntries(messages.map((message) => [message.id, revisionsOf(state, message.id).map((revision) => revision.data)]));
  return { threadId: thread.id, taskId: thread.provenance.taskId ?? null, messages, revisions, mcpRequests: mcpRequestsFor(state, thread.id), ...(diagramsByMessage ? { diagramsByMessage } : {}) };
}

/** Adds the session's notes beside the workflow start; before the chats, so chats can anchor on notes. */
export function addNotes(g: Graph, state: SessionState, nodeIds: Set<string>): void {
  const start = latestStart(state);
  if (!start) return;
  for (const artifact of state.artifacts) {
    if (artifact.type !== "Note") continue;
    const note = artifact as Artifact<NoteData>;
    g.nodes.push({ id: note.id, anchors: [start.id], data: { kind: "note", body: note.data.body } });
    g.edges.push({ id: `${note.id}->${start.id}`, source: note.id, target: start.id });
    nodeIds.add(note.id);
  }
}

/** Adds the session's open decision as a satellite of the root node (the first node). */
export function addDecisions(g: Graph, state: SessionState): void {
  const decision = state.artifacts.findLast((artifact) => artifact.type === "Decision") as Artifact<DecisionData> | undefined;
  const root = g.nodes[0];
  if (!decision || decision.data.chosen !== null || !root) return;
  g.nodes.push({ id: decision.id, anchors: [root.id], data: { kind: "decision", sessionId: state.session.id, repoDir: state.session.repoDir, decision } satisfies DecisionNodeData });
  g.edges.push({ id: `${decision.id}->${root.id}`, source: decision.id, target: root.id });
}

/** Hosts threads anchored on a node with hosted threads inside that node and adds nodes for the remaining chats; unresolvable anchors are skipped. */
export function addChats(g: Graph, state: SessionState, drafts: Draft[], hostOf: Map<string, string>, nodeIds: Set<string>, resolve: (anchor: Ref) => string | null, diffId: string, hunks: ChatNodeData["hunks"], diagramsByMessage?: Record<Id, Id[]>): void {
  const threads = state.artifacts.filter((a) => a.type === "ChatThread") as Artifact<ChatThreadData>[];
  for (const thread of threads) {
    if (hostOf.has(thread.id)) continue;
    const node = resolve(thread.data.anchor);
    if (!node) continue;
    const host = g.nodes.find((item) => item.id === node && hostedThreads(item.data));
    if (host) {
      hostedThreads(host.data)!.push({ ...threadContent(state, thread, diagramsByMessage), anchor: thread.data.anchor, quote: thread.data.quote, lines: thread.data.lines, diffId, hunks, draftId: null });
      hostOf.set(thread.id, host.id);
      nodeIds.add(thread.id);
      continue;
    }
    nodeIds.add(thread.id);
    g.nodes.push({ id: thread.id, anchors: [node], data: { kind: "chat", anchor: thread.data.anchor, quote: thread.data.quote, lines: thread.data.lines, aside: thread.data.aside, foldsToQuote: true, diffId, hunks, ...threadContent(state, thread, diagramsByMessage), draftId: null } });
    g.edges.push({ id: `${thread.id}->${node}`, source: thread.id, target: node });
  }
  for (const draft of drafts) {
    if (draft.kind === "comment") continue;
    if (draft.taskId && threads.some((thread) => thread.provenance.taskId === draft.taskId)) continue;
    const node = resolve(draft.anchor);
    if (!node) continue;
    const host = g.nodes.find((item) => item.id === node && hostedThreads(item.data));
    if (host) {
      hostedThreads(host.data)!.push({ threadId: null, taskId: draft.taskId ?? null, messages: [], revisions: {}, mcpRequests: [], anchor: draft.anchor, quote: draft.quote, lines: draft.lines, diffId, hunks, draftId: draft.id });
      hostOf.set(draft.id, host.id);
      nodeIds.add(draft.id);
      continue;
    }
    g.nodes.push({ id: draft.id, anchors: [node], data: { kind: "chat", anchor: draft.anchor, quote: draft.quote, lines: draft.lines, aside: draft.aside, diffId, hunks, threadId: null, draftId: draft.id, taskId: draft.taskId ?? null, messages: [], revisions: {}, mcpRequests: [] } });
    g.edges.push({ id: `${draft.id}->${node}`, source: draft.id, target: node });
  }
}

export function conversationGraph(state: SessionState, drafts: Draft[]): Graph | null {
  const start = latestStart(state);
  if (!start) return null;
  const root = rootThread(state, start.id);
  const g: Graph = { nodes: [conversationNode(state, start, root)], edges: [] };
  const nodeIds = new Set([start.id]);
  const hostOf = new Map(root ? [[root.id, start.id]] : []);
  const resolve = (anchor: Ref) => {
    const target = nodeIds.has(anchor) || hostOf.has(anchor) ? anchor : state.links.find((l) => l.kind === "reply" && l.from === anchor)?.to;
    const host = target && (hostOf.get(target) ?? target);
    return host && nodeIds.has(host) ? host : null;
  };
  addNotes(g, state, nodeIds);
  addChats(g, state, drafts, hostOf, nodeIds, resolve, "", []);
  return g;
}

/** The canvas graph; `root` builds it from the session (first node = root). Null when no workflow is chosen yet or the root has nothing to show yet. */
export function sessionGraph(root: (state: SessionState, drafts: Draft[]) => Graph | null, state: SessionState, drafts: Draft[] = [], freePositions: Record<string, FreePosition> = {}): Graph | null {
  const graph = state.session.workflow ? root(state, drafts) : null;
  if (graph) {
    addDecisions(graph, state);
    for (const node of graph.nodes) if (node.data.kind === "chat" || node.data.kind === "note") node.position = freePositions[node.id];
  }
  return graph;
}

const SATELLITE_GAP_X = 80;
const SATELLITE_GAP_Y = 24;

export function placeSatellites(main: Map<string, { x: number; y: number; width: number; height: number }>, satellites: { id: string; width: number; height: number; anchors: string[]; dy?: number }[]): Map<string, { x: number; y: number }> {
  const maxRight = Math.max(...[...main.values()].map((r) => r.x + r.width));
  const rects = new Map([...main].map(([id, r]) => [id, { ...r, column: 0 }]));
  const out = new Map<string, { x: number; y: number }>();
  const pending = [...satellites];
  const colY = new Map<number, number>();
  while (pending.length) {
    const eligible = pending.filter((s) => s.anchors.length > 0 && s.anchors.every((a) => rects.has(a)));
    if (!eligible.length) break;
    const anchorY = (s: typeof eligible[number]) => Math.min(...s.anchors.map((a) => rects.get(a)!.y)) + (s.dy ?? 0);
    eligible.sort((a, b) => Math.max(...a.anchors.map((id) => rects.get(id)!.column)) - Math.max(...b.anchors.map((id) => rects.get(id)!.column)) || anchorY(a) - anchorY(b));
    for (const s of eligible) {
      const anchorRects = s.anchors.map((id) => rects.get(id)!);
      const anchorColumn = Math.max(...anchorRects.map((r) => r.column));
      const x = anchorColumn === 0
        ? maxRight + SATELLITE_GAP_X
        : Math.max(...anchorRects.filter((r) => r.column === anchorColumn).map((r) => r.x + r.width)) + SATELLITE_GAP_X;
      const column = anchorColumn + 1;
      const y = Math.max(anchorY(s), colY.get(column) ?? -Infinity);
      out.set(s.id, { x, y });
      rects.set(s.id, { x, y, width: s.width, height: s.height, column });
      colY.set(column, y + s.height + SATELLITE_GAP_Y);
      pending.splice(pending.indexOf(s), 1);
    }
  }
  return out;
}

/** Estimated text lines at `charsPerLine`, at least one. */
export const lines = (text: string, charsPerLine: number) => Math.max(1, Math.ceil(text.length / charsPerLine));

/** First-paint estimate of a core kind; the canvas re-layouts with measured sizes. */
function baseSize(data: GraphNodeData, level: ZoomLevel): { width: number; height: number } {
  if (isCoreKind(data, "note")) return { width: SATELLITE_WIDTH, height: 100 + lines(data.body, 60) * 22 };
  if (isCoreKind(data, "conversation")) return { width: NODE_WIDTH[level], height: Math.min(700, 140 + Math.max(1, data.messages.length) * 120) };
  if (isCoreKind(data, "chat")) return { width: SATELLITE_WIDTH, height: level === "patch" ? 60 : 140 + data.messages.length * 80 };
  if (isCoreKind(data, "decision")) return { width: SATELLITE_WIDTH, height: 150 + data.decision.data.options.length * 10 };
  throw new Error(`No core size for node kind: ${data.kind}`);
}

export function estimateSize(data: GraphNodeData, level: ZoomLevel, textScale = 1): { width: number; height: number } {
  const size = baseSize(data, level);
  return { width: size.width * textScale, height: size.height * textScale };
}

/** With enlarged text a fit at code level scrolls instead of shrinking into concept level. */
export function fitMinZoom(textScale: number, level: ZoomLevel, stack = false): { minZoom?: number } {
  const readable = textScale > 1 && level === "code"
    ? Math.min(LEVEL_MAX_ZOOM[level], Math.round(ZOOM_THRESHOLDS.codeToConcept * textScale * 1000) / 1000)
    : 0;
  const visibleStackChanges = stack ? ZOOM_THRESHOLDS.patchToConcept : 0;
  const minZoom = Math.max(readable, visibleStackChanges);
  return minZoom > 0 ? { minZoom } : {};
}

export function layout(
  nodes: { id: string; width: number; height: number }[],
  edges: { source: string; target: string }[],
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 72 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const out = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const p = g.node(n.id);
    out.set(n.id, { x: p.x - n.width / 2, y: p.y - n.height / 2 });
  }
  return out;
}
