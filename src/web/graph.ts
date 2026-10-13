import dagre from "@dagrejs/dagre";
import type { Artifact, ChatMessageData, ChatThreadData, DiagramData, DiffFile, Hunk, Id, McpServerData, NoteData, Ref, RevisionData, SessionState, WorkflowStartData } from "../shared/types.ts";
import { revisionsOf } from "../shared/revisions.ts";
import type { Draft } from "./chat-context.ts";
import type { FreePosition } from "./free-positions.ts";

/** Width of cards. */
export const NODE_WIDTH = 480;
/** Width of satellites: spec, chat and the like. */
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
  /** Whether an epoch of the session is running: the conversation offers Stop & steer. */
  epochRunning?: boolean;
}

export type DiagramNodeData = { kind: "diagram"; diagram: Artifact<DiagramData>; closable?: boolean };
export type CoreNodeData = NoteNodeData | ChatNodeData | ConversationNodeData | DiagramNodeData;
/**
 * Data of a node kind a plugin registers. Core reads only the optional fields it documents:
 * `threads` (a `HostedThread[]` hosted inside the node), `quote` with `foldsToQuote`, `closable`
 * (the node disappears while its id is closed), `movable` (dragged positions persist as free positions),
 * and `reopenOn` (with `closable`, the node that offers this closed node for reopening).
 */
export type PluginNodeData = { kind: string; [key: string]: unknown };
export type GraphNodeData = CoreNodeData | PluginNodeData;
export interface GraphNode { id: string; data: GraphNodeData; anchors?: string[]; position?: FreePosition }
/** A node with its size, as a layout places it. */
export interface PlacedNode { id: string; data: GraphNodeData; width: number; height: number; anchors?: string[] }
export interface GraphEdge { id: string; source: string; target: string; /** Text drawn on the edge. */ label?: string; /** Extra class of the edge element. */ className?: string; /** Tooltip of the edge label. */ title?: string }
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export const isCoreKind = <K extends CoreNodeData["kind"]>(data: GraphNodeData, kind: K): data is Extract<CoreNodeData, { kind: K }> => data.kind === kind;

/** First-paint size of a diagram node: lanes set the width, steps the height. */
export const diagramSize = (data: GraphNodeData) => {
  const { lanes, steps } = (data as DiagramNodeData).diagram.data;
  return { width: Math.max(NODE_WIDTH, lanes.length * 180 + 40), height: 150 + steps.length * 110 };
};

/** The threads hosted inside a node, or null when its data has none. */
export function hostedThreads(data: GraphNodeData): HostedThread[] | null {
  return "threads" in data && Array.isArray(data.threads) ? data.threads as HostedThread[] : null;
}

/** The graph without collapsed quoted satellites (chat threads, findings): they live on as a highlight of their quote. */
export function visibleGraph(g: Graph, collapsed: ReadonlySet<string>): Graph {
  const hidden = new Set(g.nodes.filter((n) => "foldsToQuote" in n.data && n.data.foldsToQuote === true && "quote" in n.data && n.data.quote && collapsed.has(n.id)).map((n) => n.id));
  return { nodes: g.nodes.filter((n) => !hidden.has(n.id)), edges: g.edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)) };
}

export interface ClosedItem { id: string; kind: "chat" | "note" | "box" }

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
    if ("closable" in n.data && n.data.closable === true) {
      gone.add(n.id);
      if ("reopenOn" in n.data && typeof n.data.reopenOn === "string") addClosed(n.data.reopenOn, n.id, "box");
    }
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

export function conversationNode(state: SessionState, start: Artifact<WorkflowStartData>, root: Artifact<ChatThreadData> | undefined): GraphNode {
  return { id: start.id, data: {
    kind: "conversation", title: state.session.title, prompt: start.data.prompt || `/${start.data.workflow}`, anchor: start.id, diffId: "", hunks: [], draftId: null, epochRunning: state.epochs.some((epoch) => epoch.status === "running"),
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

/** Adds the session's notes beside the root node (the first node); before the chats, so chats can anchor on notes. */
export function addNotes(g: Graph, state: SessionState, nodeIds: Set<string>): void {
  const root = g.nodes[0];
  if (!root) return;
  for (const artifact of state.artifacts) {
    if (artifact.type !== "Note") continue;
    const note = artifact as Artifact<NoteData>;
    g.nodes.push({ id: note.id, anchors: [root.id], data: { kind: "note", body: note.data.body } });
    g.edges.push({ id: `${note.id}->${root.id}`, source: note.id, target: root.id });
    nodeIds.add(note.id);
  }
}

/** Hosts threads anchored on a node with hosted threads inside that node and adds nodes for the remaining chats and all asides; unresolvable anchors are skipped. */
export function addChats(g: Graph, state: SessionState, drafts: Draft[], hostOf: Map<string, string>, nodeIds: Set<string>, resolve: (anchor: Ref) => string | null, diffId: string, hunks: ChatNodeData["hunks"]): void {
  const byMessage = diagramsByMessage(g, state);
  const addChat = (id: string, node: string, hosted: HostedThread, data: ChatNodeData) => {
    const host = data.aside ? undefined : g.nodes.find((item) => item.id === node && hostedThreads(item.data));
    if (host) {
      hostedThreads(host.data)!.push(hosted);
      hostOf.set(id, host.id);
      nodeIds.add(id);
      return;
    }
    nodeIds.add(id);
    g.nodes.push({ id, anchors: [node], data });
    g.edges.push({ id: `${id}->${node}`, source: id, target: node });
  };
  const threads = state.artifacts.filter((a) => a.type === "ChatThread") as Artifact<ChatThreadData>[];
  const start = latestStart(state);
  const root = start && rootThread(state, start.id);
  for (const thread of threads) {
    if (hostOf.has(thread.id) || thread === root) continue;
    const node = resolve(thread.data.anchor);
    if (!node) continue;
    const content = threadContent(state, thread, byMessage);
    addChat(thread.id, node,
      { ...content, anchor: thread.data.anchor, quote: thread.data.quote, lines: thread.data.lines, diffId, hunks, draftId: null },
      { kind: "chat", anchor: thread.data.anchor, quote: thread.data.quote, lines: thread.data.lines, aside: thread.data.aside, foldsToQuote: true, diffId, hunks, ...content, draftId: null });
  }
  for (const draft of drafts) {
    if (draft.kind === "comment") continue;
    if (draft.taskId && threads.some((thread) => thread.provenance.taskId === draft.taskId)) continue;
    const node = resolve(draft.anchor);
    if (!node) continue;
    const content = { threadId: null, taskId: draft.taskId ?? null, messages: [], revisions: {}, mcpRequests: [] };
    addChat(draft.id, node,
      { ...content, anchor: draft.anchor, quote: draft.quote, lines: draft.lines, diffId, hunks, draftId: draft.id },
      { kind: "chat", anchor: draft.anchor, quote: draft.quote, lines: draft.lines, aside: draft.aside, diffId, hunks, ...content, draftId: draft.id });
  }
}

export function diagramsByMessage(g: Graph, state: SessionState): Record<Id, Id[]> | undefined {
  const diagramIds = new Set(g.nodes.filter((node) => node.data.kind === "diagram").map((node) => node.id));
  if (!diagramIds.size) return undefined;
  const byMessage: Record<Id, Id[]> = {};
  for (const link of state.links) if (link.kind === "derivedFrom" && diagramIds.has(link.from)) (byMessage[link.to] ??= []).push(link.from);
  return byMessage;
}

/** `keep` plus every node anchored, directly or through other kept nodes, on a kept node, and the edges among them. Adds to `keep`. */
export function subgraph(g: Graph, keep: Set<string>): Graph {
  for (let grew = true; grew;) {
    grew = false;
    for (const n of g.nodes) if (!keep.has(n.id) && n.anchors?.some((a) => keep.has(a))) { keep.add(n.id); grew = true; }
  }
  return { nodes: g.nodes.filter((n) => keep.has(n.id)), edges: g.edges.filter((e) => keep.has(e.source) && keep.has(e.target)) };
}

/** What a plugin contributes to its root graph. */
export interface RootGraphParts {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Threads hosted inside nodes: thread id → host node id. */
  hosts?: ReadonlyMap<string, string>;
  /** Resolves a chat anchor that is not a node id (e.g. `<id>#loc1`) to a node id, or null. When given it is authoritative; without it the anchor resolves through the message it replies to. */
  resolveSub?(anchor: Ref, nodeIds: ReadonlySet<string>): string | null;
  /** Diff context of chat nodes. */
  diffId?: string;
  hunks?: ChatNodeData["hunks"];
}

/** A plugin's root graph: its nodes and edges (the first node is the root), notes and chats. A chat anchor resolves to a node, through `resolveSub` (else the message it replies to); an anchor on the workflow start resolves to the root; a hosted thread resolves to its host. The session's root thread is never a chat node. */
export function rootGraph(state: SessionState, drafts: Draft[], parts: RootGraphParts): Graph {
  const g: Graph = { nodes: [...parts.nodes], edges: [...parts.edges] };
  const startId = latestStart(state)?.id;
  const hostOf = new Map(parts.hosts);
  const nodeIds = new Set([...g.nodes.map((node) => node.id), ...hostOf.keys()]);
  const resolve = (anchor: Ref) => {
    const direct = nodeIds.has(anchor) ? anchor : anchor === startId ? g.nodes[0]?.id : parts.resolveSub ? parts.resolveSub(anchor, nodeIds) : state.links.find((link) => link.kind === "reply" && link.from === anchor)?.to;
    const host = direct && (hostOf.get(direct) ?? direct);
    return host && nodeIds.has(host) ? host : null;
  };
  addNotes(g, state, nodeIds);
  addChats(g, state, drafts, hostOf, nodeIds, resolve, parts.diffId ?? "", parts.hunks ?? []);
  return g;
}

/** The chat workflow's graph: the conversation, hosting the root thread, as the only node. Null before the start request. */
export function conversationGraph(state: SessionState, drafts: Draft[]): Graph | null {
  const start = latestStart(state);
  if (!start) return null;
  const root = rootThread(state, start.id);
  return rootGraph(state, drafts, { nodes: [conversationNode(state, start, root)], edges: [], ...(root ? { hosts: new Map([[root.id, start.id]]) } : {}) });
}

/** The canvas graph; `root` builds it from the session (first node = root). Null when no workflow is chosen yet or the root has nothing to show yet. */
export function sessionGraph(root: (state: SessionState, drafts: Draft[]) => Graph | null, state: SessionState, drafts: Draft[] = [], freePositions: Record<string, FreePosition> = {}): Graph | null {
  const graph = state.session.workflow ? root(state, drafts) : null;
  if (graph) {
    for (const node of graph.nodes) if (node.data.kind === "chat" || node.data.kind === "note" || ("movable" in node.data && node.data.movable === true)) node.position = freePositions[node.id];
  }
  return graph;
}

const SATELLITE_GAP_X = 80;
const SATELLITE_GAP_Y = 24;

export function placeSatellites(main: Map<string, { x: number; y: number; width: number; height: number }>, satellites: { id: string; width: number; height: number; anchors: string[] }[]): Map<string, { x: number; y: number }> {
  const maxRight = Math.max(...[...main.values()].map((r) => r.x + r.width));
  const rects = new Map([...main].map(([id, r]) => [id, { ...r, column: 0 }]));
  const out = new Map<string, { x: number; y: number }>();
  const pending = [...satellites];
  const colY = new Map<number, number>();
  while (pending.length) {
    const eligible = pending.filter((s) => s.anchors.length > 0 && s.anchors.every((a) => rects.has(a)));
    if (!eligible.length) break;
    const anchorY = (s: typeof eligible[number]) => Math.min(...s.anchors.map((a) => rects.get(a)!.y));
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
function baseSize(data: GraphNodeData): { width: number; height: number } {
  if (isCoreKind(data, "note")) return { width: SATELLITE_WIDTH, height: 100 + lines(data.body, 60) * 22 };
  if (isCoreKind(data, "conversation")) return { width: NODE_WIDTH, height: Math.min(700, 140 + Math.max(1, data.messages.length) * 120) };
  if (isCoreKind(data, "chat")) return { width: SATELLITE_WIDTH, height: 140 + data.messages.length * 80 };
  throw new Error(`No core size for node kind: ${data.kind}`);
}

export function estimateSize(data: GraphNodeData, textScale = 1): { width: number; height: number } {
  const size = baseSize(data);
  return { width: size.width * textScale, height: size.height * textScale };
}

/** With enlarged text a fit scrolls instead of shrinking the text below its readable size. */
export function fitMinZoom(textScale: number): { minZoom?: number } {
  return textScale > 1 ? { minZoom: Math.round(0.9 * textScale * 1000) / 1000 } : {};
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
