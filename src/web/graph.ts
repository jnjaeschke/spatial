import dagre from "@dagrejs/dagre";
import type { Artifact, Commit, DiffData, DiffFile, Hunk, PatchNarrativeData, SemanticChange, SessionState } from "../shared/types.ts";

export type ZoomLevel = "patch" | "concept" | "code";

export function zoomLevel(zoom: number): ZoomLevel {
  return zoom < 0.45 ? "patch" : zoom < 0.9 ? "concept" : "code";
}

export const NODE_WIDTH: Record<ZoomLevel, number> = { patch: 360, concept: 480, code: 760 };

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

export type GraphNodeData = ChangeNodeData | SummaryNodeData;
export interface GraphNode { id: string; data: GraphNodeData }
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

const lines = (text: string, charsPerLine: number) => Math.max(1, Math.ceil(text.length / charsPerLine));

/** First-paint estimate; the canvas re-layouts with measured sizes. */
export function estimateSize(data: GraphNodeData, level: ZoomLevel): { width: number; height: number } {
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
