import dagre from "@dagrejs/dagre";
import type { Artifact, ChatMessageData, ChatThreadData, Commit, DiagramData, DiffData, DiffFile, FindingDecisionData, FindingVerdictValue, Hunk, Id, McpServerData, NoteData, PatchNarrativeData, PhabCommentData, PostedCommentData, Ref, ReviewCommentData, RevisionData, ReviewFindingData, SemanticChange, SessionState, SpecReferenceData, WorkflowId, WorkflowStartData } from "../shared/types.ts";
import { revisionsOf } from "../shared/revisions.ts";
import { postableComments } from "../shared/postable-comments.ts";
import { postPlan } from "../shared/post-plan.ts";
import { epochNumber, latestDiff, narrativeOf } from "../shared/epochs.ts";
import { findingStates, type FindingStatus } from "../shared/findings.ts";
import type { Draft } from "./chat-context.ts";
import type { FreePosition } from "./free-positions.ts";
import { phabView } from "../shared/phab-anchor.ts";
import { phabAnchorId } from "../shared/phab-comments.ts";
import { changeCommit, reviewedChanges } from "../shared/review-path.ts";

export type ZoomLevel = "patch" | "concept" | "code";

const ZOOM_THRESHOLDS = { patchToConcept: 0.6, conceptToCode: 1.2, codeToConcept: 0.9, conceptToPatch: 0.45 };

export function zoomLevel(zoom: number, current: ZoomLevel): ZoomLevel {
  if (current === "patch") return zoom >= ZOOM_THRESHOLDS.conceptToCode ? "code" : zoom >= ZOOM_THRESHOLDS.patchToConcept ? "concept" : "patch";
  if (current === "concept") return zoom >= ZOOM_THRESHOLDS.conceptToCode ? "code" : zoom < ZOOM_THRESHOLDS.conceptToPatch ? "patch" : "concept";
  return zoom < ZOOM_THRESHOLDS.conceptToPatch ? "patch" : zoom < ZOOM_THRESHOLDS.codeToConcept ? "concept" : "code";
}

/** Highest zoom that still shows each level. Fitting the view stays below it, so a fit never switches to a level with wider nodes. */
export const LEVEL_MAX_ZOOM: Record<ZoomLevel, number> = { patch: 0.59, concept: 1.19, code: 2 };

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
  /** Owning stack commit; null for single-commit diffs. */
  commit: number | null;
  reviewed: boolean;
}

export interface CommitNodeData {
  kind: "commit";
  narrativeId: string;
  index: number;
  commit: Commit;
  intent: string | null;
  changeCount: number;
  findingCount: number;
  reviewedCount: number;
}

export interface SummaryNodeData {
  kind: "summary";
  narrativeId: string;
  summary: string;
  commits: Commit[];
  changeCount: number;
  specStatus: { code: number; inferred: number; unverified: number } | null;
  drafts: { commit: number; revision: number; count: number }[];
  skipped: number;
  sessionId: Id;
  sinceEpoch: number | null;
  phabGeneral: Artifact<PhabCommentData>[];
  /** First artifact id of every comment listed here, by `phid`; keys the comment's collapse state. */
  phabAnchors: Record<string, Id>;
  phabUnanchored: { diffId: number | null; oldSide: boolean; outdatedEpoch: number | null; comments: Artifact<PhabCommentData>[] }[];
}

export interface SpecNodeData { kind: "spec"; ref: Artifact<SpecReferenceData> }
export interface DiagramNodeData { kind: "diagram"; diagram: Artifact<DiagramData> }
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
  messages: Artifact<ChatMessageData>[];
  revisions: Record<Id, RevisionData[]>;
  mcpRequests: string[];
  /** Current review diagrams created by each assistant message. */
  diagramsByMessage?: Record<Id, Id[]>;
}
export interface ConversationNodeData extends Pick<ChatNodeData, "anchor" | "diffId" | "hunks" | "threadId" | "draftId" | "taskId" | "messages" | "revisions" | "mcpRequests" | "diagramsByMessage"> {
  kind: "conversation";
  title: string;
  /** The request; shown until the first turn has created the thread. */
  prompt: string;
}

export interface FindingNodeData extends ReviewFindingData {
  kind: "finding";
  findingId: string;
  diffId: string;
  hunks: { file: DiffFile; hunk: Hunk }[];
  /** The chat anchored at the finding, shown inside the finding box. */
  thread: Pick<ChatNodeData, "taskId" | "messages" | "revisions" | "mcpRequests" | "diagramsByMessage"> & { threadId: string } | null;
  decision: FindingDecisionData["decision"] | null;
  comment: { id: string; body: string; status: Artifact<ReviewCommentData>["status"] } | null;
  postedTo: number | null;
  status: FindingStatus;
  outdated: boolean;
  verdict: { verdict: FindingVerdictValue; reason: string } | null;
  fromEpoch: number | null;
  collapsedByDefault: boolean;
}

export interface PhabNodeData {
  kind: "phab";
  anchorId: Id;
  path: string;
  line: number;
  side: "old" | "new";
  done: boolean;
  fromEpoch: number | null;
  comments: Artifact<PhabCommentData>[];
  phabAnchors: Record<string, Id>;
  diffId: string;
  hunks: { file: DiffFile; hunk: Hunk }[];
  thread: Pick<ChatNodeData, "taskId" | "messages" | "revisions" | "mcpRequests" | "diagramsByMessage"> & { threadId: string } | null;
}

export type GraphNodeData = ChangeNodeData | CommitNodeData | SummaryNodeData | SpecNodeData | DiagramNodeData | NoteNodeData | ChatNodeData | ConversationNodeData | FindingNodeData | PhabNodeData;
export interface GraphNode { id: string; data: GraphNodeData; anchors?: string[]; position?: FreePosition }
export interface GraphEdge { id: string; source: string; target: string }
type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

/** The graph without collapsed quoted satellites (chat threads, findings): they live on as a highlight of their quote. */
export const phabCommentCollapseId = (anchorId: Id) => `phab-comment:${anchorId}`;

function phabAnchorsOf(artifacts: Artifact[], comments: Artifact<PhabCommentData>[]): Record<string, Id> {
  return Object.fromEntries(comments.map((comment) => [comment.data.phid, phabAnchorId(artifacts, comment.data.phid)!]));
}

export function visibleGraph(g: { nodes: GraphNode[]; edges: GraphEdge[] }, collapsed: ReadonlySet<string>): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const hidden = new Set(g.nodes.filter((n) => ((n.data.kind === "chat" && n.data.threadId !== null) || (n.data.kind === "finding" && n.data.decision !== "dismissed")) && n.data.quote && collapsed.has(n.id)).map((n) => n.id));
  return { nodes: g.nodes.filter((n) => !hidden.has(n.id)), edges: g.edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)) };
}

export const commitNodeId = (narrativeId: string, index: number) => `${narrativeId}#commit-${index}`;
export const isSatellite = (node: GraphNode) => node.data.kind === "spec" || node.data.kind === "note" || (node.data.kind === "chat" && !node.position) || node.data.kind === "finding" || node.data.kind === "phab" || (node.data.kind === "conversation" && !!node.anchors?.length);

const latestStart = (state: SessionState) => state.artifacts.findLast((a) => a.type === "WorkflowStart") as Artifact<WorkflowStartData> | undefined;
const rootThread = (state: SessionState, startId: string) => (state.artifacts.filter((a) => a.type === "ChatThread") as Artifact<ChatThreadData>[]).find((t) => t.data.anchor === startId && !t.data.aside);

function conversationNode(state: SessionState, start: Artifact<WorkflowStartData>, root: Artifact<ChatThreadData> | undefined, anchors?: string[]): GraphNode {
  return { id: start.id, ...(anchors ? { anchors } : {}), data: {
    kind: "conversation", title: state.session.title, prompt: start.data.prompt || `/${start.data.workflow}`, anchor: start.id, diffId: "", hunks: [], draftId: null,
    ...(root ? threadContent(state, root) : { threadId: null, taskId: null, messages: [], revisions: {}, mcpRequests: [] }),
  } };
}

export function levelGraph(g: { nodes: GraphNode[]; edges: GraphEdge[] }, level: ZoomLevel): { nodes: GraphNode[]; edges: GraphEdge[] } {
  if (level !== "patch" || !g.nodes.some((n) => n.data.kind === "commit")) return g;
  const keep = new Set(g.nodes.filter((n) => n.data.kind === "summary" || n.data.kind === "commit").map((n) => n.id));
  return { nodes: g.nodes.filter((n) => keep.has(n.id)), edges: g.edges.filter((e) => keep.has(e.source) && keep.has(e.target)) };
}

export function latestNarrative(state: SessionState): { narrative: Artifact<PatchNarrativeData>; diff: Artifact<DiffData> } | null {
  const diff = latestDiff(state.artifacts);
  if (!diff) return null;
  const narrative = narrativeOf(state.artifacts, diff.id);
  if (!narrative) return null;
  return { narrative, diff };
}

export function narrativeGraph(narrative: Artifact<PatchNarrativeData>, diff: Artifact<DiffData>, artifacts: Artifact[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const previousNarrative = narrative.data.previous
    ? artifacts.find((a) => a.id === narrative.data.previous && a.type === "PatchNarrative") as Artifact<PatchNarrativeData> | undefined
    : undefined;
  if (narrative.data.previous && !previousNarrative) throw new Error(`Previous narrative ${narrative.data.previous} is missing or invalid`);
  const byHunk = new Map(diff.data.files.flatMap((file) => file.hunks.map((hunk) => [hunk.id, { file, hunk }] as const)));
  const ref = (changeId: string) => `${narrative.id}#${changeId}`;
  const nodes: GraphNode[] = [{
    id: narrative.id,
    data: { kind: "summary", narrativeId: narrative.id, summary: narrative.data.summary, commits: diff.data.commits, changeCount: narrative.data.changes.length, specStatus: null, drafts: [], skipped: 0, sessionId: narrative.sessionId,
      sinceEpoch: previousNarrative ? epochNumber(artifacts, previousNarrative.data.diffId) : null, phabGeneral: [], phabAnchors: {}, phabUnanchored: [] },
  }];
  const edges: GraphEdge[] = [];
  const stack = diff.data.commits.length > 1;
  const reviewed = reviewedChanges(artifacts, narrative.id);
  if (stack) {
    diff.data.commits.forEach((commit, index) => {
      const cardId = commitNodeId(narrative.id, index);
      nodes.push({ id: cardId, data: { kind: "commit", narrativeId: narrative.id, index, commit, intent: narrative.data.commitIntents?.[index] ?? null,
        changeCount: narrative.data.changes.filter((change) => changeCommit(diff.data, change) === index).length,
        reviewedCount: narrative.data.changes.filter((change) => changeCommit(diff.data, change) === index && reviewed.has(change.id)).length, findingCount: 0 } });
      edges.push({ id: `${narrative.id}->${cardId}`, source: narrative.id, target: cardId });
    });
  }
  for (const change of narrative.data.changes) {
    const hunks = change.hunkIds.map((id) => byHunk.get(id)!);
    const commit = stack ? changeCommit(diff.data, change) : null;
    nodes.push({
      id: ref(change.id),
      data: { kind: "change", narrativeId: narrative.id, diffId: diff.id, change, hunks, files: [...new Set(hunks.map((h) => h.file.path))], commit, reviewed: reviewed.has(change.id) },
    });
    const sources = change.dependsOn.length ? change.dependsOn.map(ref) : [commit === null ? narrative.id : commitNodeId(narrative.id, commit)];
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
  if (artifactId === narrativeId && /^commit-\d+$/.test(subId)) return nodeIds.has(anchor) ? anchor : null;
  if (artifactId === narrativeId) return narrative.changes.some((c) => c.id === subId) ? anchor : null;
  if (artifactId === diffId) {
    const change = narrative.changes.find((c) => c.hunkIds.includes(subId));
    return change ? `${narrativeId}#${change.id}` : null;
  }
  return null;
}

function mcpRequestsFor(state: SessionState, threadId: string): string[] {
  const linked = state.links.filter((link) => link.kind === "about" && link.to === threadId)
    .map((link) => state.artifacts.find((artifact) => artifact.id === link.from))
    .filter((artifact): artifact is Artifact<McpServerData> => !!artifact && (artifact.type === "McpServerRequest" || artifact.type === "McpServerEnabled"));
  const enabled = new Set(linked.filter((artifact) => artifact.type === "McpServerEnabled").map((artifact) => artifact.data.server));
  return [...new Set(linked.filter((artifact) => artifact.type === "McpServerRequest")
    .map((artifact) => artifact.data.server).filter((server) => !enabled.has(server)))];
}

function threadContent(state: SessionState, thread: Artifact<ChatThreadData>, diagramsByMessage?: Record<Id, Id[]>) {
  const messages = state.links.filter((l) => l.kind === "reply" && l.to === thread.id)
    .map((l) => state.artifacts.find((a) => a.id === l.from))
    .filter((a): a is Artifact<ChatMessageData> => !!a);
  const revisions = Object.fromEntries(messages.map((message) => [message.id, revisionsOf(state, message.id).map((revision) => revision.data)]));
  return { threadId: thread.id, taskId: thread.provenance.taskId ?? null, messages, revisions, mcpRequests: mcpRequestsFor(state, thread.id), ...(diagramsByMessage ? { diagramsByMessage } : {}) };
}

/** Adds chat nodes for threads not in `hostOf` and drafts, each attached to `resolve(anchor)`; unresolvable ones are skipped. */
function addChats(g: Graph, state: SessionState, drafts: Draft[], hostOf: ReadonlyMap<string, string>, nodeIds: Set<string>, resolve: (anchor: Ref) => string | null, diffId: string, hunks: ChatNodeData["hunks"], diagramsByMessage?: Record<Id, Id[]>): void {
  const threads = state.artifacts.filter((a) => a.type === "ChatThread") as Artifact<ChatThreadData>[];
  for (const thread of threads) {
    if (hostOf.has(thread.id)) continue;
    const node = resolve(thread.data.anchor);
    if (!node) continue;
    nodeIds.add(thread.id);
    g.nodes.push({ id: thread.id, anchors: [node], data: { kind: "chat", anchor: thread.data.anchor, quote: thread.data.quote, aside: thread.data.aside, diffId, hunks, ...threadContent(state, thread, diagramsByMessage), draftId: null } });
    g.edges.push({ id: `${thread.id}->${node}`, source: thread.id, target: node });
  }
  for (const draft of drafts) {
    const node = resolve(draft.anchor);
    if (!node) continue;
    g.nodes.push({ id: draft.id, anchors: [node], data: { kind: "chat", anchor: draft.anchor, quote: draft.quote, lines: draft.lines, aside: draft.aside, diffId, hunks, threadId: null, draftId: draft.id, taskId: draft.taskId ?? null, messages: [], revisions: {}, mcpRequests: [] } });
    g.edges.push({ id: `${draft.id}->${node}`, source: draft.id, target: node });
  }
}

function reviewGraph(state: SessionState, drafts: Draft[]): Graph | null {
  const latest = latestNarrative(state);
  if (!latest) return null;
  const g = narrativeGraph(latest.narrative, latest.diff, state.artifacts);
  const diagramsByCommit = new Map<string, Artifact<DiagramData>>();
  for (const artifact of state.artifacts) {
    if (artifact.type !== "Diagram") continue;
    const diagram = artifact as Artifact<DiagramData>;
    if (latest.diff.data.commits.some((commit) => commit.sha === diagram.data.commit)) diagramsByCommit.set(diagram.data.commit, diagram);
  }
  for (const commit of latest.diff.data.commits) {
    const diagram = diagramsByCommit.get(commit.sha);
    if (!diagram) continue;
    g.nodes.push({ id: diagram.id, data: { kind: "diagram", diagram } });
  }
  const diagramIds = new Set(g.nodes.filter((node) => node.data.kind === "diagram").map((node) => node.id));
  const diagramsByMessage: Record<Id, Id[]> = {};
  for (const link of state.links) {
    if (link.kind === "derivedFrom" && diagramIds.has(link.from)) (diagramsByMessage[link.to] ??= []).push(link.from);
  }
  const summary = g.nodes.find((n) => n.id === latest.narrative.id)!.data as SummaryNodeData;
  const plan = postPlan(latest.diff.data, postableComments(state, latest.narrative.id));
  summary.drafts = plan.revisions.map((r) => ({ commit: r.commit, revision: r.revision.id, count: r.items.length }));
  summary.skipped = plan.skipped.length;
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
  /** Thread id -> host node id, for threads shown inside their finding or Phabricator box. */
  const hostOf = new Map<string, string>();
  const resolve = (anchor: Ref) => {
    const id = anchorNodeId(anchor, latest.narrative.id, latest.narrative.data, latest.diff.id, nodeIds, state.links);
    return id && (hostOf.get(id) ?? id);
  };
  const allHunks = latest.diff.data.files.flatMap((file) => file.hunks.map((hunk) => ({ file, hunk })));
  const threads = state.artifacts.filter((a) => a.type === "ChatThread") as Artifact<ChatThreadData>[];
  const start = latestStart(state);
  const root = start ? rootThread(state, start.id) : undefined;
  if (start) {
    const summaryId = latest.narrative.id;
    g.nodes.push(conversationNode(state, start, root, [summaryId]));
    g.edges.push({ id: `${start.id}->${summaryId}`, source: start.id, target: summaryId });
    nodeIds.add(start.id);
    if (root) { nodeIds.add(root.id); hostOf.set(root.id, start.id); }
  }
  const phab = phabView(state.artifacts, latest.diff, latest.narrative.data);
  summary.phabGeneral = phab.general;
  summary.phabUnanchored = phab.unanchored;
  summary.phabAnchors = phabAnchorsOf(state.artifacts, [...phab.general, ...phab.unanchored.flatMap((group) => group.comments)]);
  for (const remote of phab.anchored) {
    const node = resolve(remote.anchor);
    if (!node) continue;
    const thread = threads.find((item) => item.data.anchor === remote.anchorId);
    if (thread) { hostOf.set(thread.id, remote.anchorId); nodeIds.add(thread.id); }
    g.nodes.push({ id: remote.anchorId, anchors: [node], data: {
      kind: "phab", ...remote, phabAnchors: phabAnchorsOf(state.artifacts, remote.comments), diffId: latest.diff.id,
      hunks: allHunks, thread: thread ? threadContent(state, thread, diagramsByMessage) : null,
    } });
    g.edges.push({ id: `${remote.anchorId}->${node}`, source: remote.anchorId, target: node });
  }
  for (const findingState of findingStates(state, latest.narrative.id)) {
    const finding = findingState.finding;
    const node = resolve(findingState.anchor ?? latest.narrative.id);
    if (!node) continue;
    nodeIds.add(finding.id);
    const thread = threads.find((t) => t.data.anchor === finding.id);
    if (thread) { hostOf.set(thread.id, finding.id); nodeIds.add(thread.id); }
    const related = state.links.filter((link) => link.kind === "about" && link.to === finding.id).map((link) => link.from);
    const comment = state.artifacts.filter((a) => a.type === "ReviewComment" && related.includes(a.id)).at(-1) as Artifact<ReviewCommentData> | undefined;
    const posted = comment && (state.artifacts.filter((a) => a.type === "PostedComment") as Artifact<PostedCommentData>[]).find((a) => a.data.comment === comment.id);
    g.nodes.push({ id: finding.id, anchors: [node], data: {
      kind: "finding", findingId: finding.id, ...finding.data, anchor: findingState.anchor ?? latest.narrative.id,
      quote: findingState.quote, lines: findingState.lines, status: findingState.status, outdated: findingState.outdated,
      verdict: findingState.verdict ? { verdict: findingState.verdict.verdict, reason: findingState.verdict.reason } : null,
      fromEpoch: findingState.epoch < epochNumber(state.artifacts, latest.diff.id) ? findingState.epoch : null,
      collapsedByDefault: findingState.collapsedByDefault, diffId: latest.diff.id, hunks: allHunks,
      thread: thread ? threadContent(state, thread, diagramsByMessage) : null,
      decision: findingState.decision,
      comment: comment ? { id: comment.id, body: comment.data.body, status: comment.status } : null,
      postedTo: posted?.data.revision ?? null,
    } });
    g.edges.push({ id: `${finding.id}->${node}`, source: finding.id, target: node });
  }
  for (const finding of g.nodes.filter((n): n is GraphNode & { data: FindingNodeData } => n.data.kind === "finding" && n.data.decision !== "dismissed" && !n.data.outdated)) {
    const anchor = finding.anchors?.[0];
    const change = g.nodes.find((n) => n.id === anchor && n.data.kind === "change");
    if (change?.data.kind !== "change" || change.data.commit === null) continue;
    const commit = change.data.commit;
    const card = g.nodes.find((n) => n.id === commitNodeId(latest.narrative.id, commit));
    if (card?.data.kind === "commit") card.data.findingCount++;
  }
  addChats(g, state, drafts, hostOf, nodeIds, resolve, latest.diff.id, allHunks, diagramsByMessage);
  return g;
}

function conversationGraph(state: SessionState, drafts: Draft[]): Graph | null {
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
  addChats(g, state, drafts, hostOf, nodeIds, resolve, "", []);
  return g;
}

const ROOT_GRAPHS: Record<WorkflowId, (state: SessionState, drafts: Draft[]) => Graph | null> = { review: reviewGraph, chat: conversationGraph };

/** The canvas graph; its root (first node) comes from the session's workflow. Null when no workflow is chosen yet or the workflow has nothing to show yet. */
export function sessionGraph(state: SessionState, drafts: Draft[] = [], freePositions: Record<string, FreePosition> = {}): Graph | null {
  const graph = state.session.workflow ? ROOT_GRAPHS[state.session.workflow](state, drafts) : null;
  if (graph) {
    const start = latestStart(state);
    if (start) for (const artifact of state.artifacts) {
      if (artifact.type !== "Note") continue;
      const note = artifact as Artifact<NoteData>;
      graph.nodes.push({ id: note.id, anchors: [start.id], position: freePositions[note.id], data: { kind: "note", body: note.data.body } });
      graph.edges.push({ id: `${note.id}->${start.id}`, source: note.id, target: start.id });
    }
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

const lines = (text: string, charsPerLine: number) => Math.max(1, Math.ceil(text.length / charsPerLine));

/** Bot comments start collapsed to one preview line; long comments are clamped to 12 lines. */
const phabCommentHeight = (comment: PhabCommentData, charsPerLine: number) => 30 + (comment.bot ? 1 : Math.min(lines(comment.body, charsPerLine), 12)) * 20;

/** First-paint estimate; the canvas re-layouts with measured sizes. */
function baseSize(data: GraphNodeData, level: ZoomLevel): { width: number; height: number } {
  if (data.kind === "note") return { width: SATELLITE_WIDTH, height: 100 + lines(data.body, 60) * 22 };
  if (data.kind === "diagram") return { width: NODE_WIDTH[level], height: 70 + Math.ceil(data.diagram.data.nodes.length / 4) * 76 };
  if (data.kind === "conversation") return { width: NODE_WIDTH[level], height: Math.min(700, 140 + Math.max(1, data.messages.length) * 120) };
  if (data.kind === "finding") return { width: SATELLITE_WIDTH, height: level === "patch" ? 60 : 110 + lines(data.body, 60) * 20 + (data.thread?.messages.length ?? 0) * 80 };
  if (data.kind === "phab") return { width: SATELLITE_WIDTH, height: level === "patch" ? 60 : 110 + data.comments.reduce((sum, item) => sum + phabCommentHeight(item.data, 60), 0) + (data.thread?.messages.length ?? 0) * 80 };
  if (data.kind === "spec") return { width: SATELLITE_WIDTH, height: level === "patch" ? 80 : level === "concept" ? 220 : 420 };
  if (data.kind === "chat") return { width: SATELLITE_WIDTH, height: level === "patch" ? 60 : 140 + data.messages.length * 80 };
  const width = NODE_WIDTH[level];
  if (data.kind === "commit") return { width, height: level === "patch" ? 120 : 100 + lines(data.intent ?? "", 55) * 22 };
  if (data.kind === "summary") {
    const phabHeight = [data.phabGeneral, ...data.phabUnanchored.map((group) => group.comments)].reduce((sum, comments) => sum + (comments.length > 0 ? 40 : 0) + comments.reduce((inner, item) => inner + phabCommentHeight(item.data, 55), 0), 0);
    return { width, height: level === "patch" ? 140 : 90 + lines(data.summary, 55) * 22 + data.commits.length * 22 + phabHeight };
  }
  if (level === "patch") return { width, height: 60 + lines(data.change.title, 20) * 36 };
  const concept = 60 + (lines(data.change.explanation, 55) + lines(data.change.rationale, 55)) * 22 + data.files.length * 20;
  if (level === "concept") return { width, height: concept };
  return { width, height: concept + data.hunks.reduce((sum, h) => sum + 40 + h.hunk.lines.length * 18, 0) };
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

/** Adds ordering edges for a single-commit diagram without changing the displayed graph edges. */
export function diagramLayoutEdges(nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[] {
  const diagram = nodes.find((node) => node.data.kind === "diagram");
  const summary = nodes.find((node) => node.data.kind === "summary");
  if (!diagram || !summary) return edges;
  const predecessors = new Set(edges.map((edge) => edge.target));
  return [
    ...edges,
    { id: `layout:${summary.id}->${diagram.id}`, source: summary.id, target: diagram.id },
    ...nodes.filter((node) => node.data.kind === "change" && !predecessors.has(node.id))
      .map((node) => ({ id: `layout:${diagram.id}->${node.id}`, source: diagram.id, target: node.id })),
  ];
}

const LANE_GAP = 120;
const LANE_TOP_GAP = 72;
type Placed = { id: string; data: GraphNodeData; width: number; height: number; anchors?: string[]; dy?: number };

/** Stack layout: summary above commit lanes, with lane-local changes and satellites arranged independently. */
export function stackLayout(nodes: Placed[], edges: { source: string; target: string }[]): Map<string, { x: number; y: number }> {
  const root = nodes.find((n) => n.data.kind === "summary")!;
  const laneOf = new Map<string, number>();
  for (const n of nodes) {
    if (n.data.kind === "commit") laneOf.set(n.id, n.data.index);
    if (n.data.kind === "change") laneOf.set(n.id, n.data.commit!);
    if (n.data.kind === "diagram") laneOf.set(n.id, n.data.diagram.data.commitIndex);
  }
  const satellites = nodes.filter(isSatellite);
  for (let changed = true; changed;) {
    changed = false;
    for (const s of satellites) {
      if (laneOf.has(s.id)) continue;
      const lane = (s.anchors ?? []).map((a) => laneOf.get(a)).find((l) => l !== undefined);
      if (lane !== undefined) { laneOf.set(s.id, lane); changed = true; }
    }
  }
  const sized = (s: Placed, anchors: string[]) => ({ id: s.id, width: s.width, height: s.height, anchors, ...(s.dy === undefined ? {} : { dy: s.dy }) });
  const out = new Map<string, { x: number; y: number }>();
  const rootSats = satellites.filter((s) => !laneOf.has(s.id)).map((s) => sized(s, (s.anchors ?? []).filter((a) => !laneOf.has(a))));
  const rootPlaced = placeSatellites(new Map([[root.id, { x: 0, y: 0, width: root.width, height: root.height }]]), rootSats);
  const top = Math.max(root.height, ...rootSats.filter((s) => rootPlaced.has(s.id)).map((s) => rootPlaced.get(s.id)!.y + s.height)) + LANE_TOP_GAP;
  const maxDiagramHeight = Math.max(0, ...nodes.filter((n) => n.data.kind === "diagram").map((n) => n.height));
  const lanes = [...new Set(nodes.flatMap((n) => n.data.kind === "commit" ? [n.data.index] : []))].sort((a, b) => a - b);
  let x = 0;
  for (const lane of lanes) {
    const diagram = nodes.find((n) => n.data.kind === "diagram" && laneOf.get(n.id) === lane);
    const main = nodes.filter((n) => !isSatellite(n) && n.data.kind !== "summary" && n.data.kind !== "diagram" && laneOf.get(n.id) === lane);
    const card = main.find((n) => n.data.kind === "commit")!;
    const ids = new Set(main.map((n) => n.id));
    const inLane = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const reached = new Set(inLane.map((e) => e.target));
    const local = layout(main, [...inLane, ...main.filter((n) => n !== card && !reached.has(n.id)).map((n) => ({ source: card.id, target: n.id }))]);
    const minX = Math.min(...main.map((n) => local.get(n.id)!.x));
    const minY = Math.min(...main.map((n) => local.get(n.id)!.y));
    const laneTop = top + (maxDiagramHeight ? maxDiagramHeight + LANE_TOP_GAP : 0);
    const rects = new Map(main.map((n) => [n.id, { x: local.get(n.id)!.x - minX + x, y: local.get(n.id)!.y - minY + laneTop, width: n.width, height: n.height }] as const));
    if (diagram) {
      const cardRect = rects.get(card.id)!;
      out.set(diagram.id, { x: cardRect.x, y: top });
    }
    const laneSats = satellites.filter((s) => laneOf.get(s.id) === lane).map((s) => sized(s, (s.anchors ?? []).filter((a) => laneOf.get(a) === lane)));
    const placed = placeSatellites(rects, laneSats);
    let right = -Infinity;
    for (const [id, r] of rects) { out.set(id, { x: r.x, y: r.y }); right = Math.max(right, r.x + r.width); }
    for (const s of laneSats) {
      const p = placed.get(s.id);
      if (p) { out.set(s.id, p); right = Math.max(right, p.x + s.width); }
    }
    x = right + LANE_GAP;
  }
  const dx = Math.max(0, (x - LANE_GAP - root.width) / 2);
  out.set(root.id, { x: dx, y: 0 });
  for (const s of rootSats) {
    const p = rootPlaced.get(s.id);
    if (p) out.set(s.id, { x: p.x + dx, y: p.y });
  }
  return out;
}
