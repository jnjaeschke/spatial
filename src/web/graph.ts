import dagre from "@dagrejs/dagre";
import type { Artifact, ChatMessageData, ChatThreadData, Commit, DiffData, DiffFile, FindingDecisionData, Hunk, Id, McpServerData, PatchNarrativeData, PostedCommentData, Ref, ReviewCommentData, RevisionData, ReviewFindingData, SemanticChange, SessionState, SpecReferenceData } from "../shared/types.ts";
import { revisionsOf } from "../shared/revisions.ts";
import { phabRevision, type PhabRevision } from "../shared/phabricator.ts";
import { postableComments } from "../shared/postable-comments.ts";
import type { Draft } from "./chat-context.ts";

export type ZoomLevel = "patch" | "concept" | "code";

export function zoomLevel(zoom: number): ZoomLevel {
  return zoom < 0.45 ? "patch" : zoom < 0.9 ? "concept" : "code";
}

/** Highest zoom that still shows each level. Fitting the view stays below it, so a fit never switches to a level with wider nodes. */
export const LEVEL_MAX_ZOOM: Record<ZoomLevel, number> = { patch: 0.449, concept: 0.899, code: 2 };

export const NODE_WIDTH: Record<ZoomLevel, number> = { patch: 360, concept: 480, code: 760 };
/** Width of spec and chat satellites at every zoom level. */
export const SATELLITE_WIDTH = 420;

export interface ChangeNodeData {
  kind: "change";
  narrativeId: string;
  diffId: string;
  change: SemanticChange;
  hunks: { file: DiffFile; hunk: Hunk }[];
  files: string[];
}

export interface SummaryNodeData {
  kind: "summary";
  narrativeId: string;
  summary: string;
  commits: Commit[];
  changeCount: number;
  specStatus: { code: number; inferred: number; unverified: number } | null;
  revision: PhabRevision | null;
  pendingComments: number;
  sessionId: Id;
}

export interface SpecNodeData { kind: "spec"; ref: Artifact<SpecReferenceData> }
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
  messages: Artifact<ChatMessageData>[];
  revisions: Record<Id, RevisionData[]>;
  mcpRequests: string[];
}

export interface FindingNodeData extends ReviewFindingData {
  kind: "finding";
  findingId: string;
  diffId: string;
  hunks: { file: DiffFile; hunk: Hunk }[];
  /** The chat anchored at the finding, shown inside the finding box. */
  thread: Pick<ChatNodeData, "taskId" | "messages" | "revisions" | "mcpRequests"> & { threadId: string } | null;
  decision: FindingDecisionData["decision"] | null;
  comment: { id: string; body: string; status: Artifact<ReviewCommentData>["status"] } | null;
  postedTo: number | null;
}

export type GraphNodeData = ChangeNodeData | SummaryNodeData | SpecNodeData | ChatNodeData | FindingNodeData;
export interface GraphNode { id: string; data: GraphNodeData; anchors?: string[] }
export interface GraphEdge { id: string; source: string; target: string }

/** The graph without collapsed quoted satellites (chat threads, findings): they live on as a highlight of their quote. */
export function visibleGraph(g: { nodes: GraphNode[]; edges: GraphEdge[] }, collapsed: ReadonlySet<string>): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const hidden = new Set(g.nodes.filter((n) => ((n.data.kind === "chat" && n.data.threadId !== null) || n.data.kind === "finding") && n.data.quote && collapsed.has(n.id)).map((n) => n.id));
  return { nodes: g.nodes.filter((n) => !hidden.has(n.id)), edges: g.edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)) };
}

export function latestNarrative(state: SessionState): { narrative: Artifact<PatchNarrativeData>; diff: Artifact<DiffData> } | null {
  const narratives = state.artifacts.filter((a) => a.type === "PatchNarrative") as Artifact<PatchNarrativeData>[];
  const narrative = narratives.at(-1);
  if (!narrative) return null;
  const diff = state.artifacts.find((a) => a.id === narrative.data.diffId) as Artifact<DiffData> | undefined;
  if (!diff) throw new Error(`Narrative ${narrative.id} references missing diff ${narrative.data.diffId}`);
  return { narrative, diff };
}

export function narrativeGraph(narrative: Artifact<PatchNarrativeData>, diff: Artifact<DiffData>): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const byHunk = new Map(diff.data.files.flatMap((file) => file.hunks.map((hunk) => [hunk.id, { file, hunk }] as const)));
  const ref = (changeId: string) => `${narrative.id}#${changeId}`;
  const nodes: GraphNode[] = [{
    id: narrative.id,
    data: { kind: "summary", narrativeId: narrative.id, summary: narrative.data.summary, commits: diff.data.commits, changeCount: narrative.data.changes.length, specStatus: null, revision: phabRevision(diff.data), pendingComments: 0, sessionId: narrative.sessionId },
  }];
  const edges: GraphEdge[] = [];
  for (const change of narrative.data.changes) {
    const hunks = change.hunkIds.map((id) => byHunk.get(id)!);
    nodes.push({
      id: ref(change.id),
      data: { kind: "change", narrativeId: narrative.id, diffId: diff.id, change, hunks, files: [...new Set(hunks.map((h) => h.file.path))] },
    });
    const sources = change.dependsOn.length ? change.dependsOn.map(ref) : [narrative.id];
    for (const s of sources) edges.push({ id: `${s}->${ref(change.id)}`, source: s, target: ref(change.id) });
  }
  return { nodes, edges };
}

/** The graph node an anchor attaches to, or null. Whole-artifact anchors (summary, spec, chat) resolve only to nodes in `nodeIds`; a message resolves to its thread's node. */
export function anchorNodeId(
  anchor: Ref,
  narrativeId: string,
  narrative: PatchNarrativeData,
  diffId: string,
  nodeIds: ReadonlySet<string> = new Set(),
  links: SessionState["links"] = [],
): string | null {
  const i = anchor.indexOf("#");
  if (i < 0) {
    if (nodeIds.has(anchor)) return anchor;
    const thread = links.find((l) => l.kind === "reply" && l.from === anchor)?.to;
    return thread && nodeIds.has(thread) ? thread : null;
  }
  const artifactId = anchor.slice(0, i), subId = anchor.slice(i + 1);
  if (artifactId === narrativeId) return narrative.changes.some((c) => c.id === subId) ? anchor : null;
  if (artifactId === diffId) {
    const change = narrative.changes.find((c) => c.hunkIds.includes(subId));
    return change ? `${narrativeId}#${change.id}` : null;
  }
  return null;
}

export function sessionGraph(state: SessionState, drafts: Draft[] = []): { nodes: GraphNode[]; edges: GraphEdge[] } | null {
  const latest = latestNarrative(state);
  if (!latest) return null;
  const g = narrativeGraph(latest.narrative, latest.diff);
  const summary = g.nodes.find((n) => n.id === latest.narrative.id)!.data as SummaryNodeData;
  summary.pendingComments = postableComments(state).filter(({ finding }) => finding.data.lines !== undefined).length;
  const prefix = `${latest.narrative.id}#`;
  const anchorsBySpec = new Map<string, string[]>();
  for (const l of state.links) {
    if (l.kind === "supports" && l.to.startsWith(prefix)) anchorsBySpec.set(l.from, [...(anchorsBySpec.get(l.from) ?? []), l.to]);
  }
  const resolved = state.tasks.some((t) => t.kind === "resolveSpecRefs" && t.status === "succeeded" && (t.input as { narrativeId: string }).narrativeId === latest.narrative.id);
  if (resolved) {
    const status = { code: 0, inferred: 0, unverified: 0 };
    for (const a of state.artifacts) {
      if (a.type !== "SpecReference" || !anchorsBySpec.has(a.id)) continue;
      if (a.status !== "verified") status.unverified++;
      else if ((a as Artifact<SpecReferenceData>).data.origin === "code") status.code++;
      else status.inferred++;
    }
    (g.nodes.find((n) => n.id === latest.narrative.id)!.data as SummaryNodeData).specStatus = status;
  }
  for (const a of state.artifacts) {
    const anchors = anchorsBySpec.get(a.id);
    if (a.type !== "SpecReference" || !anchors) continue;
    g.nodes.push({ id: a.id, anchors, data: { kind: "spec", ref: a as Artifact<SpecReferenceData> } });
    for (const t of anchors) g.edges.push({ id: `${a.id}->${t}`, source: a.id, target: t });
  }
  const nodeIds = new Set(g.nodes.map((n) => n.id));
  /** Thread id -> finding id, for threads shown inside their finding's box. */
  const findingOf = new Map<string, string>();
  const resolve = (anchor: Ref) => {
    const id = anchorNodeId(anchor, latest.narrative.id, latest.narrative.data, latest.diff.id, nodeIds, state.links);
    return id && (findingOf.get(id) ?? id);
  };
  const allHunks = latest.diff.data.files.flatMap((file) => file.hunks.map((hunk) => ({ file, hunk })));
  const threads = state.artifacts.filter((a) => a.type === "ChatThread") as Artifact<ChatThreadData>[];
  const mcpRequestsFor = (threadId: string) => {
    const linked = state.links.filter((link) => link.kind === "about" && link.to === threadId)
      .map((link) => state.artifacts.find((artifact) => artifact.id === link.from))
      .filter((artifact): artifact is Artifact<McpServerData> => !!artifact && (artifact.type === "McpServerRequest" || artifact.type === "McpServerEnabled"));
    const enabled = new Set(linked.filter((artifact) => artifact.type === "McpServerEnabled").map((artifact) => artifact.data.server));
    return [...new Set(linked.filter((artifact) => artifact.type === "McpServerRequest")
      .map((artifact) => artifact.data.server).filter((server) => !enabled.has(server)))];
  };
  const threadContent = (thread: Artifact<ChatThreadData>) => {
    const messages = state.links.filter((l) => l.kind === "reply" && l.to === thread.id)
      .map((l) => state.artifacts.find((a) => a.id === l.from))
      .filter((a): a is Artifact<ChatMessageData> => !!a);
    const revisions = Object.fromEntries(messages.map((message) => [message.id, revisionsOf(state, message.id).map((revision) => revision.data)]));
    return { threadId: thread.id, taskId: thread.provenance.taskId ?? null, messages, revisions, mcpRequests: mcpRequestsFor(thread.id) };
  };
  for (const artifact of state.artifacts) {
    if (artifact.type !== "ReviewFinding") continue;
    const finding = artifact as Artifact<ReviewFindingData>;
    const node = resolve(finding.data.anchor);
    if (!node) continue;
    nodeIds.add(finding.id);
    const thread = threads.find((t) => t.data.anchor === finding.id);
    if (thread) { findingOf.set(thread.id, finding.id); nodeIds.add(thread.id); }
    const related = state.links.filter((link) => link.kind === "about" && link.to === finding.id).map((link) => link.from);
    const decision = state.artifacts.filter((a) => a.type === "FindingDecision" && related.includes(a.id)).at(-1) as Artifact<FindingDecisionData> | undefined;
    const comment = state.artifacts.filter((a) => a.type === "ReviewComment" && related.includes(a.id)).at(-1) as Artifact<ReviewCommentData> | undefined;
    const posted = comment && (state.artifacts.filter((a) => a.type === "PostedComment") as Artifact<PostedCommentData>[]).find((a) => a.data.comment === comment.id);
    g.nodes.push({ id: finding.id, anchors: [node], data: {
      kind: "finding", findingId: finding.id, ...finding.data, diffId: latest.diff.id, hunks: allHunks,
      thread: thread ? threadContent(thread) : null,
      decision: decision?.data.decision ?? null,
      comment: comment ? { id: comment.id, body: comment.data.body, status: comment.status } : null,
      postedTo: posted?.data.revision ?? null,
    } });
    g.edges.push({ id: `${finding.id}->${node}`, source: finding.id, target: node });
  }
  for (const thread of threads) {
    if (findingOf.has(thread.id)) continue;
    const node = resolve(thread.data.anchor);
    if (!node) continue;
    nodeIds.add(thread.id);
    g.nodes.push({ id: thread.id, anchors: [node], data: { kind: "chat", anchor: thread.data.anchor, quote: thread.data.quote, diffId: latest.diff.id, hunks: allHunks, ...threadContent(thread), draftId: null } });
    g.edges.push({ id: `${thread.id}->${node}`, source: thread.id, target: node });
  }
  for (const draft of drafts) {
    const node = resolve(draft.anchor);
    if (!node) continue;
    g.nodes.push({ id: draft.id, anchors: [node], data: { kind: "chat", anchor: draft.anchor, quote: draft.quote, lines: draft.lines, diffId: latest.diff.id, hunks: allHunks, threadId: null, draftId: draft.id, taskId: draft.taskId ?? null, messages: [], revisions: {}, mcpRequests: [] } });
    g.edges.push({ id: `${draft.id}->${node}`, source: draft.id, target: node });
  }
  return g;
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

const lines = (text: string, charsPerLine: number) => Math.max(1, Math.ceil(text.length / charsPerLine));

/** First-paint estimate; the canvas re-layouts with measured sizes. */
export function estimateSize(data: GraphNodeData, level: ZoomLevel): { width: number; height: number } {
  if (data.kind === "finding") return { width: SATELLITE_WIDTH, height: level === "patch" ? 60 : 110 + lines(data.body, 60) * 20 + (data.thread?.messages.length ?? 0) * 80 };
  if (data.kind === "spec") return { width: SATELLITE_WIDTH, height: level === "patch" ? 80 : level === "concept" ? 220 : 420 };
  if (data.kind === "chat") return { width: SATELLITE_WIDTH, height: level === "patch" ? 60 : 140 + data.messages.length * 80 };
  const width = NODE_WIDTH[level];
  if (data.kind === "summary") {
    return { width, height: level === "patch" ? 140 : 90 + lines(data.summary, 55) * 22 + data.commits.length * 22 };
  }
  if (level === "patch") return { width, height: 60 + lines(data.change.title, 20) * 36 };
  const concept = 60 + (lines(data.change.explanation, 55) + lines(data.change.rationale, 55)) * 22 + data.files.length * 20;
  if (level === "concept") return { width, height: concept };
  return { width, height: concept + data.hunks.reduce((sum, h) => sum + 40 + h.hunk.lines.length * 18, 0) };
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
