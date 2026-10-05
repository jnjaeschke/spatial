import dagre from "@dagrejs/dagre";
import type { Artifact, ChatMessageData, ChatThreadData, Commit, DiffData, DiffFile, Hunk, PatchNarrativeData, Ref, SemanticChange, SessionState, SpecReferenceData } from "../shared/types.ts";

export type ZoomLevel = "patch" | "concept" | "code";

export function zoomLevel(zoom: number): ZoomLevel {
  return zoom < 0.45 ? "patch" : zoom < 0.9 ? "concept" : "code";
}

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
  summary: string;
  commits: Commit[];
  changeCount: number;
}

export interface SpecNodeData { kind: "spec"; ref: Artifact<SpecReferenceData> }
export interface ChatNodeData {
  kind: "chat";
  anchor: Ref;
  threadId: string | null;
  draftId: string | null;
  /** Task of the turn that created the thread (or that the draft sent); later turns carry `threadId` in their input. */
  taskId: string | null;
  messages: Artifact<ChatMessageData>[];
}

export type GraphNodeData = ChangeNodeData | SummaryNodeData | SpecNodeData | ChatNodeData;
export interface GraphNode { id: string; data: GraphNodeData; anchors?: string[] }
export interface GraphEdge { id: string; source: string; target: string }

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
    data: { kind: "summary", summary: narrative.data.summary, commits: diff.data.commits, changeCount: narrative.data.changes.length },
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

export function anchorNodeId(anchor: Ref, narrativeId: string, narrative: PatchNarrativeData, diffId: string): string | null {
  const i = anchor.indexOf("#");
  if (i < 0) return null;
  const artifactId = anchor.slice(0, i), subId = anchor.slice(i + 1);
  if (artifactId === narrativeId) return narrative.changes.some((c) => c.id === subId) ? anchor : null;
  if (artifactId === diffId) {
    const change = narrative.changes.find((c) => c.hunkIds.includes(subId));
    return change ? `${narrativeId}#${change.id}` : null;
  }
  return null;
}

export function sessionGraph(state: SessionState, drafts: { id: string; anchor: Ref; taskId?: string }[] = []): { nodes: GraphNode[]; edges: GraphEdge[] } | null {
  const latest = latestNarrative(state);
  if (!latest) return null;
  const g = narrativeGraph(latest.narrative, latest.diff);
  const prefix = `${latest.narrative.id}#`;
  const anchorsBySpec = new Map<string, string[]>();
  for (const l of state.links) {
    if (l.kind === "supports" && l.to.startsWith(prefix)) anchorsBySpec.set(l.from, [...(anchorsBySpec.get(l.from) ?? []), l.to]);
  }
  for (const a of state.artifacts) {
    const anchors = anchorsBySpec.get(a.id);
    if (a.type !== "SpecReference" || !anchors) continue;
    g.nodes.push({ id: a.id, anchors, data: { kind: "spec", ref: a as Artifact<SpecReferenceData> } });
    for (const t of anchors) g.edges.push({ id: `${a.id}->${t}`, source: a.id, target: t });
  }
  const threads = state.artifacts.filter((a) => a.type === "ChatThread") as Artifact<ChatThreadData>[];
  for (const thread of threads) {
    const node = anchorNodeId(thread.data.anchor, latest.narrative.id, latest.narrative.data, latest.diff.id);
    if (!node) continue;
    const messages = state.links.filter((l) => l.kind === "reply" && l.to === thread.id)
      .map((l) => state.artifacts.find((a) => a.id === l.from))
      .filter((a): a is Artifact<ChatMessageData> => !!a);
    g.nodes.push({ id: thread.id, anchors: [node], data: { kind: "chat", anchor: thread.data.anchor, threadId: thread.id, draftId: null, taskId: thread.provenance.taskId ?? null, messages } });
    g.edges.push({ id: `${thread.id}->${node}`, source: thread.id, target: node });
  }
  for (const draft of drafts) {
    const node = anchorNodeId(draft.anchor, latest.narrative.id, latest.narrative.data, latest.diff.id);
    if (!node) continue;
    g.nodes.push({ id: draft.id, anchors: [node], data: { kind: "chat", anchor: draft.anchor, threadId: null, draftId: draft.id, taskId: draft.taskId ?? null, messages: [] } });
    g.edges.push({ id: `${draft.id}->${node}`, source: draft.id, target: node });
  }
  return g;
}

const SATELLITE_GAP_X = 80;
const SATELLITE_GAP_Y = 24;

export function placeSatellites(main: Map<string, { x: number; y: number; width: number; height: number }>, satellites: { id: string; width: number; height: number; anchors: string[] }[]): Map<string, { x: number; y: number }> {
  const x = Math.max(...[...main.values()].map((r) => r.x + r.width)) + SATELLITE_GAP_X;
  const anchorY = (s: { anchors: string[] }) => Math.min(...s.anchors.map((a) => main.get(a)?.y ?? Infinity));
  const out = new Map<string, { x: number; y: number }>();
  let nextFree = -Infinity;
  for (const s of [...satellites].sort((a, b) => anchorY(a) - anchorY(b))) {
    const y = Math.max(anchorY(s), nextFree);
    out.set(s.id, { x, y });
    nextFree = y + s.height + SATELLITE_GAP_Y;
  }
  return out;
}

const lines = (text: string, charsPerLine: number) => Math.max(1, Math.ceil(text.length / charsPerLine));

/** First-paint estimate; the canvas re-layouts with measured sizes. */
export function estimateSize(data: GraphNodeData, level: ZoomLevel): { width: number; height: number } {
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
