import type { BugReportData, BugSummaryData, FindingDecisionData, FindingVerdictValue, PhabCommentData, ReviewCommentData, ReviewFindingData, SpecReferenceData } from "../shared/types.ts";
import type { PostedCommentData } from "../../../web/plugin-api.ts";
import type { Artifact, ChatThreadData, Commit, DiagramData, DiffData, DiffFile, Hunk, Id, PatchNarrativeData, Ref, SemanticChange, SequenceStep, SessionState } from "../../../web/plugin-api.ts";
import { NODE_WIDTH, SATELLITE_WIDTH, addChats, addNotes, cascade, conversationNode, isSatellite, latestStart, layout, lines, placeSatellites, rootThread, threadContent, type ChatNodeData, type Draft, type Graph, type GraphEdge, type GraphNode, type GraphNodeData, type HostedThread, type PlacedNode, type ZoomLevel } from "../../../web/graph-api.ts";
import { numberLines } from "../shared/diff-lines.ts";
import { postableComments } from "../shared/postable-comments.ts";
import { postPlan } from "../shared/post-plan.ts";
import { diffNumber, latestDiff, narrativeOf } from "../shared/diffs.ts";
import { findingStates, type FindingStatus } from "../shared/findings.ts";
import { phabView } from "../shared/phab-anchor.ts";
import { phabAnchorId } from "../shared/phab-comments.ts";
import { changeCommit, reviewedChanges } from "../shared/review-path.ts";

export type ChangeNodeData = {
  kind: "change";
  narrativeId: string;
  diffId: string;
  change: SemanticChange;
  hunks: { file: DiffFile; hunk: Hunk }[];
  files: string[];
  /** Owning stack commit; null for single-commit diffs. */
  commit: number | null;
  reviewed: boolean;
  threads: HostedThread[];
};

export type CommitNodeData = {
  kind: "commit";
  narrativeId: string;
  index: number;
  commit: Commit;
  intent: string | null;
  /** Narration's phrase for a flow worth a sequence diagram; null when there is none or the commit already has a diagram. */
  flowHint: string | null;
  changeCount: number;
  findingCount: number;
  reviewedCount: number;
};

export type SummaryNodeData = {
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
  bugs: { report: Artifact<BugReportData>; summary: Artifact<BugSummaryData> | null; summarizing: boolean }[];
  bugHunks: { file: DiffFile; hunk: Hunk }[];
  bugDiffId: string;
};

export type SpecNodeData = { kind: "spec"; ref: Artifact<SpecReferenceData> };
export type DiagramNodeData = { kind: "diagram"; diagram: Artifact<DiagramData>; closable?: boolean };

/** Spreads the finding; the mapped copy keeps the data assignable to `PluginNodeData`, which an interface is not. */
export type FindingNodeData = { [K in keyof ReviewFindingData]: ReviewFindingData[K] } & {
  kind: "finding";
  findingId: string;
  /** Raised by an LLM review; false for runtime checks (Step comments). */
  ai: boolean;
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
  foldsToQuote?: boolean;
};

export type PhabNodeData = {
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
};

export type ReviewNodeData = ChangeNodeData | CommitNodeData | SummaryNodeData | SpecNodeData | DiagramNodeData | FindingNodeData | PhabNodeData;

/** Narrows node data to a review kind. */
export const isReviewKind = <K extends ReviewNodeData["kind"]>(data: GraphNodeData, kind: K): data is Extract<ReviewNodeData, { kind: K }> => data.kind === kind;

export const phabCommentCollapseId = (anchorId: Id) => `phab-comment:${anchorId}`;

export function phabAnchorsOf(artifacts: Artifact[], comments: Artifact<PhabCommentData>[]): Record<string, Id> {
  return Object.fromEntries(comments.map((comment) => [comment.data.phid, phabAnchorId(artifacts, comment.data.phid)!]));
}

/** Finds a verified sequence citation in the rendered diff rows. */
export function diagramStepTarget(nodes: GraphNode[], diagram: Artifact<DiagramData>, step: SequenceStep): { changeNodeId: string; hunkId: string; row: { side: "new" | "old"; line: number } } | null {
  if (!step.verified || step.status === "existing" || step.status === "removed") return null;
  for (const node of nodes) {
    if (!isReviewKind(node.data, "change")) continue;
    for (const { file, hunk } of node.data.hunks) {
      const path = file.path;
      if (node.data.commit !== null) {
        const index = hunk.lines.findIndex((item) => item.kind === "add" && item.commit === diagram.data.commitIndex && (item.commitPath ?? path) === step.cite.path && item.commitLine === step.cite.line);
        if (index !== -1) {
          const rendered = numberLines(hunk)[index];
          if (rendered?.new !== undefined) return { changeNodeId: node.id, hunkId: hunk.id, row: { side: "new", line: rendered.new } };
        }
      } else if (path === step.cite.path) {
        const line = numberLines(hunk).find((item) => (item.kind === "add" || item.kind === "ctx") && item.new === step.cite.line);
        if (line?.new !== undefined) return { changeNodeId: node.id, hunkId: hunk.id, row: { side: "new", line: line.new } };
      }
    }
  }
  return null;
}

/** Kinds of review input the canvas can hide: spec cards and spec checks, AI review findings, Phabricator comments. */
export type Layer = "spec" | "review" | "phab";
export const LAYERS: Layer[] = ["spec", "review", "phab"];

const layerOf = (data: GraphNodeData): Layer | null =>
  isReviewKind(data, "spec") ? "spec" : isReviewKind(data, "finding") ? (data.ai ? "review" : "spec") : isReviewKind(data, "phab") ? "phab" : null;

/** The graph without the hidden layers' nodes and what hangs off them; hiding Phabricator also drops the summary's general and unanchored comments. */
export function layerGraph(g: Graph, hidden: ReadonlySet<Layer>): Graph {
  if (hidden.size === 0) return g;
  const gone = new Set(g.nodes.filter((n) => { const layer = layerOf(n.data); return layer !== null && hidden.has(layer); }).map((n) => n.id));
  cascade(g, gone);
  const nodes = g.nodes.filter((n) => !gone.has(n.id)).map((n) => isReviewKind(n.data, "summary") && hidden.has("phab") ? { ...n, data: { ...n.data, phabGeneral: [], phabUnanchored: [] } } : n);
  return { nodes, edges: g.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)) };
}

export const commitNodeId = (narrativeId: string, index: number) => `${narrativeId}#commit-${index}`;

/** The visible node for a reading-path step, using its commit card at patch zoom in a stack. */
export function stepNodeId(step: Pick<ChangeNodeData, "narrativeId" | "commit" | "change">, level: ZoomLevel): string {
  return level === "patch" && step.commit !== null ? commitNodeId(step.narrativeId, step.commit) : `${step.narrativeId}#${step.change.id}`;
}

/** At patch zoom a stack shows its summary and commit cards only. */
export function levelGraph(g: Graph, level: ZoomLevel): Graph {
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

export function narrativeGraph(narrative: Artifact<PatchNarrativeData>, diff: Artifact<DiffData>, artifacts: Artifact[]): Graph {
  const previousNarrative = narrative.data.previous
    ? artifacts.find((a) => a.id === narrative.data.previous && a.type === "PatchNarrative") as Artifact<PatchNarrativeData> | undefined
    : undefined;
  if (narrative.data.previous && !previousNarrative) throw new Error(`Previous narrative ${narrative.data.previous} is missing or invalid`);
  const byHunk = new Map(diff.data.files.flatMap((file) => file.hunks.map((hunk) => [hunk.id, { file, hunk }] as const)));
  const ref = (changeId: string) => `${narrative.id}#${changeId}`;
  const nodes: GraphNode[] = [{
    id: narrative.id,
    data: { kind: "summary", narrativeId: narrative.id, summary: narrative.data.summary, commits: diff.data.commits, changeCount: narrative.data.changes.length, specStatus: null, drafts: [], skipped: 0, sessionId: narrative.sessionId,
      sinceEpoch: previousNarrative ? diffNumber(artifacts, previousNarrative.data.diffId) : null, phabGeneral: [], phabAnchors: {}, phabUnanchored: [], bugs: [],
      bugHunks: [...new Set(narrative.data.changes.flatMap((change) => change.hunkIds))].flatMap((id) => byHunk.has(id) ? [byHunk.get(id)!] : []), bugDiffId: narrative.data.diffId } satisfies SummaryNodeData,
  }];
  const edges: GraphEdge[] = [];
  const stack = diff.data.commits.length > 1;
  const reviewed = reviewedChanges(artifacts, narrative.id);
  if (stack) {
    diff.data.commits.forEach((commit, index) => {
      const cardId = commitNodeId(narrative.id, index);
      nodes.push({ id: cardId, data: { kind: "commit", narrativeId: narrative.id, index, commit, intent: narrative.data.commitIntents?.[index] ?? null, flowHint: narrative.data.flowHints?.[index] ?? null,
        changeCount: narrative.data.changes.filter((change) => changeCommit(diff.data, change) === index).length,
        reviewedCount: narrative.data.changes.filter((change) => changeCommit(diff.data, change) === index && reviewed.has(change.id)).length, findingCount: 0 } satisfies CommitNodeData });
      edges.push({ id: `${narrative.id}->${cardId}`, source: narrative.id, target: cardId });
    });
  }
  for (const change of narrative.data.changes) {
    const hunks = change.hunkIds.map((id) => byHunk.get(id)!);
    const commit = stack ? changeCommit(diff.data, change) : null;
    nodes.push({
      id: ref(change.id),
      data: { kind: "change", narrativeId: narrative.id, diffId: diff.id, change, hunks, files: [...new Set(hunks.map((h) => h.file.path))], commit, reviewed: reviewed.has(change.id), threads: [] } satisfies ChangeNodeData,
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

export function reviewGraph(state: SessionState, drafts: Draft[]): Graph | null {
  const latest = latestNarrative(state);
  if (!latest) return null;
  const g = narrativeGraph(latest.narrative, latest.diff, state.artifacts);
  const diagramsByCommit = new Map<string, Artifact<DiagramData>>();
  for (const artifact of state.artifacts) {
    if (artifact.type !== "Diagram") continue;
    const diagram = artifact as Artifact<DiagramData>;
    if (diagram.data.kind !== "sequence") continue;
    if (latest.diff.data.commits.some((commit) => commit.sha === diagram.data.commit)) diagramsByCommit.set(diagram.data.commit, diagram);
  }
  latest.diff.data.commits.forEach((commit, index) => {
    const diagram = diagramsByCommit.get(commit.sha);
    if (!diagram) return;
    g.nodes.push({ id: diagram.id, data: { kind: "diagram", diagram, closable: true } satisfies DiagramNodeData });
    const card = g.nodes.find((node) => node.id === commitNodeId(latest.narrative.id, index));
    if (card && isReviewKind(card.data, "commit")) card.data.flowHint = null;
  });
  const diagramIds = new Set(g.nodes.filter((node) => node.data.kind === "diagram").map((node) => node.id));
  const diagramsByMessage: Record<Id, Id[]> = {};
  for (const link of state.links) {
    if (link.kind === "derivedFrom" && diagramIds.has(link.from)) (diagramsByMessage[link.to] ??= []).push(link.from);
  }
  const summary = g.nodes.find((n) => n.id === latest.narrative.id)!.data as SummaryNodeData;
  const bugNumbers = new Set(latest.diff.data.commits.flatMap((commit) => [...commit.subject.matchAll(/\bBug (\d+)\b/gi)].map((match) => Number(match[1]))));
  const reports = state.artifacts.filter((a): a is Artifact<BugReportData> => a.type === "BugReport" && bugNumbers.has((a.data as BugReportData).bug));
  summary.bugs = reports.map((report) => ({
    report,
    summary: state.artifacts.filter((a): a is Artifact<BugSummaryData> => a.type === "BugSummary" && (a.data as BugSummaryData).bug === report.data.bug).at(-1) ?? null,
    summarizing: state.tasks.some((task) => task.kind === "summarizeBug" && task.status === "running" && (task.input as { reportId?: string }).reportId === report.id),
  }));
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
    g.nodes.push({ id: a.id, anchors, data: { kind: "spec", ref: a as Artifact<SpecReferenceData> } satisfies SpecNodeData });
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
    } satisfies PhabNodeData });
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
      kind: "finding", findingId: finding.id, ai: finding.provenance.llm !== undefined, ...finding.data, anchor: findingState.anchor ?? latest.narrative.id,
      quote: findingState.quote, lines: findingState.lines, status: findingState.status, outdated: findingState.outdated,
      verdict: findingState.verdict ? { verdict: findingState.verdict.verdict, reason: findingState.verdict.reason } : null,
      fromEpoch: findingState.epoch < diffNumber(state.artifacts, latest.diff.id) ? findingState.epoch : null,
      collapsedByDefault: findingState.collapsedByDefault, diffId: latest.diff.id, hunks: allHunks,
      thread: thread ? threadContent(state, thread, diagramsByMessage) : null,
      decision: findingState.decision, foldsToQuote: findingState.decision !== "dismissed",
      comment: comment ? { id: comment.id, body: comment.data.body, status: comment.status } : null,
      postedTo: posted?.data.revision ?? null,
    } satisfies FindingNodeData });
    g.edges.push({ id: `${finding.id}->${node}`, source: finding.id, target: node });
  }
  for (const finding of g.nodes.filter((n): n is GraphNode & { data: FindingNodeData } => isReviewKind(n.data, "finding") && n.data.decision !== "dismissed" && !n.data.outdated)) {
    const anchor = finding.anchors?.[0];
    const change = g.nodes.find((n) => n.id === anchor && n.data.kind === "change");
    if (!change || !isReviewKind(change.data, "change") || change.data.commit === null) continue;
    const commit = change.data.commit;
    const card = g.nodes.find((n) => n.id === commitNodeId(latest.narrative.id, commit));
    if (card && isReviewKind(card.data, "commit")) card.data.findingCount++;
  }
  addNotes(g, state, nodeIds);
  addChats(g, state, drafts, hostOf, nodeIds, resolve, latest.diff.id, allHunks, diagramsByMessage);
  return g;
}

const phabCommentHeight = (comment: PhabCommentData, charsPerLine: number) => 30 + (comment.bot ? 1 : Math.min(lines(comment.body, charsPerLine), 12)) * 20;

/** First-paint size estimate of the review kinds, unscaled. */
export function reviewSize(data: GraphNodeData, level: ZoomLevel): { width: number; height: number } {
  if (isReviewKind(data, "diagram")) return { width: Math.max(NODE_WIDTH[level], data.diagram.data.lanes.length * 170), height: 150 + Math.max(data.diagram.data.steps.length, data.diagram.data.before?.length ?? 0) * 92 };
  if (isReviewKind(data, "finding")) return { width: SATELLITE_WIDTH, height: level === "patch" ? 60 : 110 + lines(data.body, 60) * 20 + (data.thread?.messages.length ?? 0) * 80 };
  if (isReviewKind(data, "phab")) return { width: SATELLITE_WIDTH, height: level === "patch" ? 60 : 110 + data.comments.reduce((sum, item) => sum + phabCommentHeight(item.data, 60), 0) + (data.thread?.messages.length ?? 0) * 80 };
  if (isReviewKind(data, "spec")) return { width: SATELLITE_WIDTH, height: level === "patch" ? 80 : level === "concept" ? 220 : 420 };
  const width = NODE_WIDTH[level];
  if (isReviewKind(data, "commit")) return { width, height: level === "patch" ? 120 : 100 + lines(data.intent ?? "", 55) * 22 };
  if (isReviewKind(data, "summary")) {
    const phabHeight = [data.phabGeneral, ...data.phabUnanchored.map((group) => group.comments)].reduce((sum, comments) => sum + (comments.length > 0 ? 40 : 0) + comments.reduce((inner, item) => inner + phabCommentHeight(item.data, 55), 0), 0);
    return { width, height: level === "patch" ? 140 : 90 + lines(data.summary, 55) * 22 + data.commits.length * 22 + phabHeight };
  }
  if (!isReviewKind(data, "change")) throw new Error(`Not a review node kind: ${data.kind}`);
  if (level === "patch") return { width, height: 60 + lines(data.change.title, 20) * 36 };
  const concept = 60 + (lines(data.change.explanation, 55) + lines(data.change.rationale, 55)) * 22 + data.files.length * 20;
  const threadHeight = data.threads.reduce((sum, thread) => sum + 80 + thread.messages.length * 80, 0);
  if (level === "concept") return { width, height: concept + threadHeight };
  return { width, height: concept + data.hunks.reduce((sum, h) => sum + 40 + h.hunk.lines.length * 18, 0) + threadHeight };
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

/** Stack layout: summary above commit lanes, with lane-local changes and satellites arranged independently. */
export function stackLayout(nodes: PlacedNode[], edges: { source: string; target: string }[]): Map<string, { x: number; y: number }> {
  const root = nodes.find((n) => n.data.kind === "summary")!;
  const laneOf = new Map<string, number>();
  for (const n of nodes) {
    if (isReviewKind(n.data, "commit")) laneOf.set(n.id, n.data.index);
    if (isReviewKind(n.data, "change")) laneOf.set(n.id, n.data.commit!);
    if (isReviewKind(n.data, "diagram")) laneOf.set(n.id, n.data.diagram.data.commitIndex);
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
  const sized = (s: PlacedNode, anchors: string[]) => ({ id: s.id, width: s.width, height: s.height, anchors, ...(s.dy === undefined ? {} : { dy: s.dy }) });
  const out = new Map<string, { x: number; y: number }>();
  const rootSats = satellites.filter((s) => !laneOf.has(s.id)).map((s) => sized(s, (s.anchors ?? []).filter((a) => !laneOf.has(a))));
  const rootPlaced = placeSatellites(new Map([[root.id, { x: 0, y: 0, width: root.width, height: root.height }]]), rootSats);
  const top = Math.max(root.height, ...rootSats.filter((s) => rootPlaced.has(s.id)).map((s) => rootPlaced.get(s.id)!.y + s.height)) + LANE_TOP_GAP;
  const maxDiagramHeight = Math.max(0, ...nodes.filter((n) => n.data.kind === "diagram").map((n) => n.height));
  const lanes = [...new Set(nodes.flatMap((n) => isReviewKind(n.data, "commit") ? [n.data.index] : []))].sort((a, b) => a - b);
  let x = 0;
  let diagramRight = -Infinity;
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
      const diagramX = Math.max(cardRect.x, diagramRight + LANE_GAP);
      out.set(diagram.id, { x: diagramX, y: top });
      diagramRight = diagramX + diagram.width;
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
