import type { BugReportData, BugSummaryData, FindingDecisionData, FindingVerdictValue, PhabCommentData, ReviewCommentData, ReviewFindingData, ReviewSubmissionData, SpecReferenceData, UserCommentData } from "../shared/types.ts";
import type { PostedCommentData } from "../../../web/plugin-api.ts";
import type { Artifact, ChatThreadData, Commit, DiagramData, DiffData, DiffFile, Hunk, Id, PatchNarrativeData, Ref, SemanticChange, SequenceStep, SessionState } from "../../../web/plugin-api.ts";
import { NODE_WIDTH, SATELLITE_WIDTH, addChats, addNotes, cascade, conversationNode, isSatellite, latestStart, layout, lines, numberLines, placeSatellites, rootThread, threadContent, type ChatNodeData, type Draft, type Graph, type GraphEdge, type GraphNode, type GraphNodeData, type HostedThread, type PlacedNode } from "../../../web/graph-api.ts";
import { postableComments, reviewDraft } from "../shared/postable-comments.ts";
import { postPlan } from "../shared/post-plan.ts";
import { diffNumber, latestDiff, narrativeOf } from "../shared/diffs.ts";
import { findingStates, type FindingStatus } from "../shared/findings.ts";
import { phabView } from "../shared/phab-anchor.ts";
import { phabAnchorId } from "../shared/phab-comments.ts";
import { changeCommit, reviewedChanges, withUnassigned } from "../shared/review-path.ts";
import { currentUserComments } from "../shared/postable-comments.ts";
import { commitRevision } from "../shared/phabricator.ts";
import { postTarget } from "../shared/post-plan.ts";
import { latestSymbols, symbolMarks } from "./symbols.ts";
import type { IntroducedSymbolsData } from "../shared/types.ts";

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
  phabThreads: PhabThreadData[];
  specs: { specId: Id; title: string; text: string }[];
  comments: { artifact?: Artifact<UserCommentData>; draft?: Draft; lines: UserCommentData["lines"]; revision: number | null; postedTo: number | null }[];
  findings: FindingData[];
  symbols?: IntroducedSymbolsData["symbols"];
};

/** The change at its Change place: the same data as `ChangeNodeData`, with the threads that no hunk card shows. */
export type ChangeHeaderNodeData = Omit<ChangeNodeData, "kind"> & { kind: "changeHeader" };

/** One hunk of a change at its Change place, with the threads and comments that anchor in it. */
export type HunkNodeData = {
  kind: "hunk";
  narrativeId: string;
  diffId: string;
  changeId: string;
  file: DiffFile;
  hunk: Hunk;
  /** Owning stack commit; null for single-commit diffs. */
  commit: number | null;
  threads: HostedThread[];
  phabThreads: PhabThreadData[];
  comments: ChangeNodeData["comments"];
  findings: FindingData[];
  symbols?: IntroducedSymbolsData["symbols"];
};

/** Edges from each symbol definition hunk to distinct hunks in this change that use it. */
export function introducedSymbolEdges(changeNodeId: string, hunks: { file: DiffFile; hunk: Hunk }[], symbols: IntroducedSymbolsData["symbols"]): (GraphEdge & { label: string })[] {
  const namesByPair = new Map<string, { source: string; target: string; names: string[] }>();
  for (const [name, definition] of Object.entries(symbols)) {
    const sourceIndex = hunks.findIndex(({ hunk }) => hunk.id === definition.hunkId);
    if (sourceIndex < 0) continue;
    for (let i = 0; i < hunks.length; i++) {
      if (i === sourceIndex) continue;
      const { hunk } = hunks[i]!;
      const usesName = hunk.lines.some((line) => symbolMarks(line.text, definition.commit, symbols).some((mark) => mark.name === name));
      if (!usesName) continue;
      const source = `${changeNodeId}/${definition.hunkId}`, target = `${changeNodeId}/${hunk.id}`, key = `${source}->${target}`;
      const pair = namesByPair.get(key) ?? { source, target, names: [] };
      pair.names.push(name);
      namesByPair.set(key, pair);
    }
  }
  return [...namesByPair].map(([key, pair]) => ({ id: key, source: pair.source, target: pair.target, label: pair.names.join(", ") }));
}

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
  findings: FindingData[];
  reviewedCount: number;
  threads?: HostedThread[];
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
  findings: FindingData[];
  reviews: { revision: number; comments: { path: string; line: number; body: string }[]; body: string; submissions: Artifact<ReviewSubmissionData>[] }[];
  sessionId: Id;
  sinceEpoch: number | null;
  phabGeneral: Artifact<PhabCommentData>[];
  /** First artifact id of every comment listed here, by `phid`; keys the comment's collapse state. */
  phabAnchors: Record<string, Id>;
  phabUnanchored: { diffId: number | null; oldSide: boolean; outdatedEpoch: number | null; comments: Artifact<PhabCommentData>[] }[];
  phabGeneralThreads: PhabThreadData[];
  phabUnanchoredThreads: PhabThreadData[];
  bugs: { report: Artifact<BugReportData>; summary: Artifact<BugSummaryData> | null; summarizing: boolean }[];
  bugHunks: { file: DiffFile; hunk: Hunk }[];
  bugDiffId: string;
  threads?: HostedThread[];
};

export type DiagramNodeData = { kind: "diagram"; diagram: Artifact<DiagramData>; closable?: boolean };

/** Spreads the finding; the mapped copy keeps the data assignable to `PluginNodeData`, which an interface is not. */
export type FindingData = { [K in keyof ReviewFindingData]: ReviewFindingData[K] } & {
  findingId: string;
  /** Raised by an LLM review; false for runtime checks (Step comments). */
  ai: boolean;
  diffId: string;
  hunks: { file: DiffFile; hunk: Hunk }[];
  /** The chat anchored at the finding, shown in its detail panel. */
  thread: Pick<ChatNodeData, "taskId" | "messages" | "revisions" | "mcpRequests" | "diagramsByMessage"> & { threadId: string } | null;
  decision: FindingDecisionData["decision"] | null;
  comment: { id: string; body: string; status: Artifact<ReviewCommentData>["status"] } | null;
  postedTo: number | null;
  status: FindingStatus;
  outdated: boolean;
  verdict: { verdict: FindingVerdictValue; reason: string } | null;
  fromEpoch: number | null;
};

export type PhabThreadData = {
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

export type ReviewNodeData = ChangeNodeData | ChangeHeaderNodeData | HunkNodeData | CommitNodeData | SummaryNodeData | DiagramNodeData;

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

const findingLayer = (finding: FindingData): Layer => finding.ai ? "review" : "spec";

/** Findings hosted by a node: chips of a change, commit or summary card. */
export const findingsOf = (data: GraphNodeData): FindingData[] => "findings" in data && Array.isArray(data.findings) ? data.findings as FindingData[] : [];
const isActive = (finding: FindingData) => finding.decision !== "dismissed" && !finding.outdated;
const commitFindingCount = (nodes: GraphNode[], index: number) => nodes.reduce((sum, n) => sum + (isReviewKind(n.data, "change") && n.data.commit === index ? n.data.findings.filter(isActive).length : 0), 0);

/** The graph without the hidden layers' nodes and what hangs off them; hiding Phabricator also drops the summary's general and unanchored comments. */
export function layerGraph(g: Graph, hidden: ReadonlySet<Layer>): Graph {
  if (hidden.size === 0) return g;
  const kept = g.nodes.map((n) => {
    let data = n.data;
    if ("findings" in data) data = { ...data, findings: findingsOf(data).filter((finding) => !hidden.has(findingLayer(finding))) } as typeof data;
    if (isReviewKind(data, "summary") && hidden.has("phab")) data = { ...data, phabGeneral: [], phabUnanchored: [], phabGeneralThreads: [], phabUnanchoredThreads: [] };
    if ((isReviewKind(data, "change") || isReviewKind(data, "changeHeader") || isReviewKind(data, "hunk")) && hidden.has("phab")) data = { ...data, phabThreads: [] };
    if ((isReviewKind(data, "change") || isReviewKind(data, "changeHeader")) && hidden.has("spec")) data = { ...data, specs: [] };
    return data === n.data ? n : { ...n, data } as GraphNode;
  });
  const nodes = kept.map((n) => isReviewKind(n.data, "commit") ? { ...n, data: { ...n.data, findingCount: commitFindingCount(kept, n.data.index) } } : n);
  return { nodes, edges: g.edges };
}

export const commitNodeId = (narrativeId: string, index: number) => `${narrativeId}#commit-${index}`;

/** The graph node a reading-path step centers. */
export const stepNodeId = (step: Pick<ChangeNodeData, "narrativeId" | "change">) => `${step.narrativeId}#${step.change.id}`;

const isStack = (g: Graph) => g.nodes.some((n) => n.data.kind === "commit");
const patchIndex = (place: string) => /^patch:\d+$/.test(place) ? Number(place.slice(6)) : null;
const changePlaceId = (place: string) => place.startsWith("change:") ? place.slice(7) : null;
const commitCard = (g: Graph, index: number) => g.nodes.find((n) => isReviewKind(n.data, "commit") && n.data.index === index);
const changeNode = (g: Graph, id: string) => g.nodes.find((n) => n.id === id && isReviewKind(n.data, "change"));

const rowsOf = (lines: { path: string; side: "new" | "old"; end: number }, file: DiffFile, hunk: Hunk) => lines.path === file.path && numberLines(hunk).some((row) => lines.end === (lines.side === "new" ? row.new : row.old));
const threadInHunk = (thread: HostedThread, file: DiffFile, hunk: Hunk) => !!thread.lines && thread.anchor.split("#").at(-1) === hunk.id && rowsOf(thread.lines, file, hunk);

/** The nodes in `keep` with everything anchored on them (transitively) and the edges among them. */
function subgraph(g: Graph, keep: Set<string>): Graph {
  for (let grew = true; grew;) {
    grew = false;
    for (const n of g.nodes) if (!keep.has(n.id) && n.anchors?.some((a) => keep.has(a))) { keep.add(n.id); grew = true; }
  }
  return { nodes: g.nodes.filter((n) => keep.has(n.id)), edges: g.edges.filter((e) => keep.has(e.source) && keep.has(e.target)) };
}

const crumbLabel = (g: Graph, place: string) => {
  if (place === "stack") return "Stack";
  const index = patchIndex(place);
  if (index !== null) return isStack(g) ? `C${index + 1}` : "Patch";
  const node = changeNode(g, changePlaceId(place) ?? "");
  const title = node && isReviewKind(node.data, "change") ? node.data.change.title : place;
  return title.length > 40 ? `${title.slice(0, 39)}…` : title;
};

/** The review's places: `stack`, `patch:<commit index>` and `change:<change node id>`. */
export const reviewPlaces = {
  initial: (g: Graph) => isStack(g) ? "stack" : "patch:0",
  graph(g: Graph, place: string): Graph | null {
    if (place === "stack") return isStack(g) ? subgraph(g, new Set(g.nodes.filter((n) => n.data.kind === "summary" || n.data.kind === "commit" || n.data.kind === "diagram").map((n) => n.id))) : null;
    const index = patchIndex(place);
    if (index !== null) {
      if (!isStack(g)) return index === 0 ? g : null;
      const card = commitCard(g, index);
      if (!card) return null;
      const patch = subgraph(g, new Set(g.nodes.filter((n) => n === card || (isReviewKind(n.data, "change") && n.data.commit === index) || (isReviewKind(n.data, "diagram") && n.data.diagram.data.commitIndex === index)).map((n) => n.id)));
      const reached = new Set(patch.edges.map((e) => e.target));
      return { nodes: patch.nodes, edges: [...patch.edges, ...patch.nodes.filter((n) => isReviewKind(n.data, "change") && !reached.has(n.id)).map((n) => ({ id: `${card.id}->${n.id}`, source: card.id, target: n.id }))] };
    }
    const id = changePlaceId(place);
    const node = id === null ? undefined : changeNode(g, id);
    if (id === null || !node || !isReviewKind(node.data, "change")) return null;
    const data = node.data;
    const { change, narrativeId, diffId, commit } = data;
    const satellites = subgraph(g, new Set([id]));
    const cards = data.hunks.map(({ file, hunk }): GraphNode => ({ id: `${id}/${hunk.id}`, data: { kind: "hunk", narrativeId, diffId, changeId: change.id, file, hunk, commit, symbols: data.symbols, threads: data.threads.filter((thread) => threadInHunk(thread, file, hunk)), phabThreads: data.phabThreads.filter((thread) => thread.path === file.path && numberLines(hunk).some((row) => (thread.side === "new" ? row.new : row.old) === thread.line)), comments: data.comments.filter((item) => rowsOf(item.lines, file, hunk)), findings: data.findings.filter((finding) => finding.lines && rowsOf(finding.lines, file, hunk)) } satisfies HunkNodeData }));
    const header: GraphNode = { ...node, data: { ...data, kind: "changeHeader", threads: data.threads.filter((thread) => !data.hunks.some(({ file, hunk }) => threadInHunk(thread, file, hunk))), phabThreads: data.phabThreads.filter((thread) => !data.hunks.some(({ file, hunk }) => thread.path === file.path && numberLines(hunk).some((row) => (thread.side === "new" ? row.new : row.old) === thread.line))), comments: [], findings: data.findings.filter((finding) => !finding.lines) } satisfies ChangeHeaderNodeData };
    const symbolEdges = introducedSymbolEdges(id, data.hunks, data.symbols ?? {});
    return { nodes: [header, ...cards, ...satellites.nodes.filter((n) => n.id !== id)], edges: [...satellites.edges, ...symbolEdges] };
  },
  open(g: Graph, place: string, nodeId: string): string | null {
    const node = g.nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    if (place === "stack") return isReviewKind(node.data, "commit") ? `patch:${node.data.index}` : null;
    return patchIndex(place) !== null && isReviewKind(node.data, "change") ? `change:${node.id}` : null;
  },
  up(g: Graph, place: string): { place: string; nodeId: string } | null {
    const id = changePlaceId(place);
    if (id !== null) {
      const node = changeNode(g, id);
      return node && isReviewKind(node.data, "change") ? { place: `patch:${node.data.commit ?? 0}`, nodeId: id } : null;
    }
    const index = patchIndex(place);
    const card = index !== null && isStack(g) ? commitCard(g, index) : undefined;
    return card ? { place: "stack", nodeId: card.id } : null;
  },
  crumbs(g: Graph, place: string): { place: string; label: string }[] {
    const chain: string[] = [];
    for (let p: string | null = place; p !== null; p = reviewPlaces.up(g, p)?.place ?? null) chain.unshift(p);
    return chain.map((p) => ({ place: p, label: crumbLabel(g, p) }));
  },
};

/** A reading-path step before the canvas adds its reviewed toggle: `change` is set for steps that toggle one change. */
export interface GuideEntry { title: string; tag?: string; reviewed: boolean; nodeId: string; place?: string; change?: ChangeNodeData }

/** The reading path of a place: commits at the stack, a patch's changes at a patch, every change at a change. */
export function guideEntries(g: Graph, place: string | null): GuideEntry[] {
  if (place === null) return [];
  const changes = g.nodes.flatMap((n) => isReviewKind(n.data, "change") ? [n.data] : []);
  const step = (data: ChangeNodeData): GuideEntry => ({ title: data.change.title, ...(data.commit !== null ? { tag: `C${data.commit + 1}` } : {}), reviewed: data.reviewed, nodeId: stepNodeId(data), change: data });
  if (place === "stack") return g.nodes.flatMap((n) => isReviewKind(n.data, "commit") ? [{ title: n.data.intent ?? n.data.commit.subject, tag: `C${n.data.index + 1}`, reviewed: n.data.reviewedCount === n.data.changeCount, nodeId: n.id }] : []);
  const index = patchIndex(place);
  if (index !== null) return changes.filter((data) => (data.commit ?? 0) === index).map(step);
  return changePlaceId(place) === null ? [] : changes.map((data) => ({ ...step(data), place: `change:${stepNodeId(data)}` }));
}

export function latestNarrative(state: SessionState): { narrative: Artifact<PatchNarrativeData>; diff: Artifact<DiffData> } | null {
  const diff = latestDiff(state.artifacts);
  if (!diff) return null;
  const narrative = narrativeOf(state.artifacts, diff.id);
  if (!narrative) return null;
  return { narrative, diff };
}

export function narrativeGraph(narrative: Artifact<PatchNarrativeData>, diff: Artifact<DiffData>, artifacts: Artifact[], drafts: Draft[] = []): Graph {
  const previousNarrative = narrative.data.previous
    ? artifacts.find((a) => a.id === narrative.data.previous && a.type === "PatchNarrative") as Artifact<PatchNarrativeData> | undefined
    : undefined;
  if (narrative.data.previous && !previousNarrative) throw new Error(`Previous narrative ${narrative.data.previous} is missing or invalid`);
  const changes = withUnassigned(narrative.data, diff.data);
  const byHunk = new Map(diff.data.files.flatMap((file) => file.hunks.map((hunk) => [hunk.id, { file, hunk }] as const)));
  const ref = (changeId: string) => `${narrative.id}#${changeId}`;
  const nodes: GraphNode[] = [{
    id: narrative.id,
    data: { kind: "summary", narrativeId: narrative.id, summary: narrative.data.summary, commits: diff.data.commits, changeCount: changes.length, specStatus: null, drafts: [], skipped: 0, reviews: [], sessionId: narrative.sessionId,
      sinceEpoch: previousNarrative ? diffNumber(artifacts, previousNarrative.data.diffId) : null, findings: [], phabGeneral: [], phabAnchors: {}, phabUnanchored: [], phabGeneralThreads: [], phabUnanchoredThreads: [], bugs: [],
      bugHunks: [...new Set(changes.flatMap((change) => change.hunkIds))].flatMap((id) => byHunk.has(id) ? [byHunk.get(id)!] : []), bugDiffId: narrative.data.diffId, threads: [] } satisfies SummaryNodeData,
  }];
  const edges: GraphEdge[] = [];
  const stack = diff.data.commits.length > 1;
  const reviewed = reviewedChanges(artifacts, narrative.id);
  if (stack) {
    diff.data.commits.forEach((commit, index) => {
      const cardId = commitNodeId(narrative.id, index);
      nodes.push({ id: cardId, data: { kind: "commit", narrativeId: narrative.id, index, commit, intent: narrative.data.commitIntents?.[index] ?? null, flowHint: narrative.data.flowHints?.[index] ?? null,
        changeCount: changes.filter((change) => changeCommit(diff.data, change) === index).length,
        reviewedCount: changes.filter((change) => changeCommit(diff.data, change) === index && reviewed.has(change.id)).length, findingCount: 0, findings: [], threads: [] } satisfies CommitNodeData });
      edges.push({ id: `${narrative.id}->${cardId}`, source: narrative.id, target: cardId });
    });
  }
  const userComments = currentUserComments(artifacts).filter((comment) => comment.data.diffId === diff.id);
  const commentDrafts = drafts.filter((draft) => draft.kind === "comment" && draft.lines);
  const commentForHunks = (hunks: { file: DiffFile; hunk: Hunk }[]) => {
    const contains = (range: UserCommentData["lines"]) => hunks.some(({ file, hunk }) => rowsOf(range, file, hunk));
    const saved = userComments.filter((comment) => contains(comment.data.lines)).map((artifact) => {
      const target = postTarget(diff.data, artifact.data.lines);
      const revision = "skip" in target ? null : commitRevision(diff.data.commits[target.commit]!)?.id ?? null;
      const stableId = artifact.data.replaces ?? artifact.id;
      const posted = artifacts.filter((item) => item.type === "PostedComment").find((item) => (item.data as PostedCommentData).comment === stableId);
      return { artifact, lines: artifact.data.lines, revision, postedTo: posted ? (posted.data as PostedCommentData).revision : null };
    });
    const transient = commentDrafts.filter((draft) => !!draft.lines && contains(draft.lines)).map((draft) => {
      const target = postTarget(diff.data, draft.lines!);
      const revision = "skip" in target ? null : commitRevision(diff.data.commits[target.commit]!)?.id ?? null;
      return { draft, lines: draft.lines!, revision, postedTo: null };
    });
    return [...saved, ...transient];
  };
  for (const change of changes) {
    const hunks = change.hunkIds.map((id) => byHunk.get(id)!);
    const commit = stack ? changeCommit(diff.data, change) : null;
    nodes.push({
      id: ref(change.id),
      data: { kind: "change", narrativeId: narrative.id, diffId: diff.id, change, hunks, files: [...new Set(hunks.map((h) => h.file.path))], commit, reviewed: reviewed.has(change.id), threads: [], phabThreads: [], specs: [], comments: commentForHunks(hunks), findings: [] } satisfies ChangeNodeData,
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
    const supportedChange = links.find((link) => link.kind === "supports" && link.from === anchor)?.to;
    if (supportedChange && nodeIds.has(supportedChange)) return supportedChange;
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
  const g = narrativeGraph(latest.narrative, latest.diff, state.artifacts, drafts);
  const symbols = latestSymbols(state, latest.diff.id)?.symbols;
  if (symbols) for (const node of g.nodes) if (isReviewKind(node.data, "change")) node.data.symbols = symbols;
  const narrativeData = { ...latest.narrative.data, changes: withUnassigned(latest.narrative.data, latest.diff.data) };
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
  summary.drafts = plan.revisions.map((group) => ({ commit: group.commit, revision: group.revision.id, count: group.items.length }));
  summary.skipped = plan.skipped.length;
  const submissions = state.artifacts.filter((artifact): artifact is Artifact<ReviewSubmissionData> => artifact.type === "ReviewSubmission");
  summary.reviews = latest.diff.data.commits.flatMap((commit, index) => {
    const revision = commitRevision(commit)?.id;
    if (revision === undefined) return [];
    const group = plan.revisions.find((item) => item.commit === index);
    return [{ revision, comments: group?.items.map((item) => ({ path: item.target.path, line: item.target.start, body: item.body })) ?? [],
      body: reviewDraft(state.artifacts, revision), submissions: submissions.filter((item) => item.data.revision === revision) }];
  });
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
    const ref = a as Artifact<SpecReferenceData>;
    for (const target of anchors) {
      const host = g.nodes.find((node) => node.id === target);
      if (host && isReviewKind(host.data, "change")) host.data.specs.push({ specId: ref.id, title: ref.data.resolved?.title ?? ref.data.resolved?.anchor ?? ref.data.url, text: ref.data.resolved?.content ?? ref.data.reason ?? "" });
    }
  }
  const nodeIds = new Set(g.nodes.map((n) => n.id));
  /** Thread id -> host node id, for threads shown inside Phabricator details. */
  const hostOf = new Map<string, string>();
  const resolve = (anchor: Ref) => {
    const id = anchorNodeId(anchor, latest.narrative.id, narrativeData, latest.diff.id, nodeIds, state.links);
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
  const phab = phabView(state.artifacts, latest.diff, narrativeData);
  summary.phabGeneral = phab.general;
  summary.phabUnanchored = phab.unanchored;
  summary.phabAnchors = phabAnchorsOf(state.artifacts, [...phab.general, ...phab.unanchored.flatMap((group) => group.comments)]);
  const makePhabThread = (remote: typeof phab.anchored[number], anchorId = remote.anchorId): PhabThreadData => {
    const thread = threads.find((item) => item.data.anchor === anchorId);
    if (thread) { hostOf.set(thread.id, anchorId); nodeIds.add(thread.id); }
    return { ...remote, anchorId, phabAnchors: phabAnchorsOf(state.artifacts, remote.comments), diffId: latest.diff.id, hunks: allHunks, thread: thread ? threadContent(state, thread, diagramsByMessage) : null };
  };
  const childComments = (rootComment: Artifact<PhabCommentData>) => state.artifacts.filter((item): item is Artifact<PhabCommentData> => item.type === "PhabComment" && (item.data as PhabCommentData).replyTo === rootComment.data.phid);
  summary.phabGeneralThreads = phab.general.map((comment) => makePhabThread({ anchorId: comment.id, anchor: latest.narrative.id, path: "", line: 0, side: "new", done: comment.data.done, fromEpoch: null, comments: [comment, ...childComments(comment)] }));
  summary.phabUnanchoredThreads = phab.unanchored.flatMap((group) => {
    const roots = group.comments.filter((comment) => !comment.data.replyTo || !group.comments.some((parent) => parent.data.phid === comment.data.replyTo));
    return roots.map((comment) => makePhabThread({ anchorId: comment.id, anchor: latest.narrative.id, path: comment.data.path ?? "", line: comment.data.line ?? 0, side: group.oldSide ? "old" : "new", done: comment.data.done, fromEpoch: group.outdatedEpoch, comments: [comment, ...childComments(comment)] }));
  });
  for (const remote of phab.anchored) {
    const node = resolve(remote.anchor);
    const host = node && g.nodes.find((item) => item.id === node);
    if (host && isReviewKind(host.data, "change")) host.data.phabThreads.push(makePhabThread(remote));
  }
  for (const findingState of findingStates(state, latest.narrative.id)) {
    const finding = findingState.finding;
    const node = resolve(findingState.anchor ?? latest.narrative.id);
    const thread = threads.find((t) => t.data.anchor === finding.id);
    if (thread) { hostOf.set(thread.id, node ?? latest.narrative.id); nodeIds.add(thread.id); }
    const related = state.links.filter((link) => link.kind === "about" && link.to === finding.id).map((link) => link.from);
    const comment = state.artifacts.filter((a) => a.type === "ReviewComment" && related.includes(a.id)).at(-1) as Artifact<ReviewCommentData> | undefined;
    const posted = comment && (state.artifacts.filter((a) => a.type === "PostedComment") as Artifact<PostedCommentData>[]).find((a) => a.data.comment === comment.id);
    const item = {
      findingId: finding.id, ai: finding.provenance.llm !== undefined, ...finding.data, anchor: findingState.anchor ?? latest.narrative.id,
      quote: findingState.quote, lines: findingState.lines, status: findingState.status, outdated: findingState.outdated,
      verdict: findingState.verdict ? { verdict: findingState.verdict.verdict, reason: findingState.verdict.reason } : null,
      fromEpoch: findingState.epoch < diffNumber(state.artifacts, latest.diff.id) ? findingState.epoch : null,
      diffId: latest.diff.id, hunks: allHunks,
      thread: thread ? threadContent(state, thread, diagramsByMessage) : null,
      decision: findingState.decision,
      comment: comment ? { id: comment.id, body: comment.data.body, status: comment.status } : null,
      postedTo: posted?.data.revision ?? null,
    } satisfies FindingData;
    const host = g.nodes.find((n) => n.id === node && "findings" in n.data) ?? g.nodes.find((n) => n.data.kind === "summary")!;
    findingsOf(host.data).push(item);
  }
  for (const card of g.nodes) if (isReviewKind(card.data, "commit")) card.data.findingCount = commitFindingCount(g.nodes, card.data.index);
  addNotes(g, state, nodeIds);
  addChats(g, state, drafts, hostOf, nodeIds, resolve, latest.diff.id, allHunks, diagramsByMessage);
  return g;
}

/** A review with nothing pending or submitted starts collapsed. */
export const reviewIsEmpty = (review: SummaryNodeData["reviews"][number]) => review.comments.length === 0 && !review.body && review.submissions.length === 0;

const phabCommentHeight = (comment: PhabCommentData, charsPerLine: number) => 30 + (comment.bot ? 1 : Math.min(lines(comment.body, charsPerLine), 12)) * 20;

const CODE_WIDTH = 760;
const threadsHeight = (threads: HostedThread[]) => threads.reduce((sum, thread) => sum + 80 + thread.messages.length * 80, 0);

/** First-paint size estimate of the review kinds, unscaled. */
export function reviewSize(data: GraphNodeData): { width: number; height: number } {
  if (isReviewKind(data, "diagram")) return { width: Math.max(NODE_WIDTH, data.diagram.data.lanes.length * 180 + 40), height: 150 + data.diagram.data.steps.length * 110 };
  if (isReviewKind(data, "commit")) return { width: NODE_WIDTH, height: 100 + lines(data.intent ?? "", 55) * 22 };
  if (isReviewKind(data, "summary")) {
    const phabHeight = [data.phabGeneral, ...data.phabUnanchored.map((group) => group.comments)].reduce((sum, comments) => sum + (comments.length > 0 ? 40 : 0) + comments.reduce((inner, item) => inner + phabCommentHeight(item.data, 55), 0), 0);
    const reviewHeight = data.reviews.reduce((sum, review) => sum + (reviewIsEmpty(review) ? 40 : 220 + review.submissions.length * 20), 0);
    return { width: NODE_WIDTH, height: 90 + lines(data.summary, 55) * 22 + data.commits.length * 22 + phabHeight + reviewHeight };
  }
  if (isReviewKind(data, "hunk")) return { width: CODE_WIDTH, height: 80 + data.hunk.lines.length * 18 + threadsHeight(data.threads) };
  if (isReviewKind(data, "changeHeader")) return { width: CODE_WIDTH, height: 60 + (lines(data.change.explanation, 55) + lines(data.change.rationale, 55)) * 22 + threadsHeight(data.threads) };
  if (!isReviewKind(data, "change")) throw new Error(`Not a review node kind: ${data.kind}`);
  return { width: NODE_WIDTH, height: 60 + (lines(data.change.explanation, 55) + lines(data.change.rationale, 55)) * 22 + data.files.length * 20 + threadsHeight(data.threads) };
}

/** Adds ordering edges for a single-commit diagram without changing the displayed graph edges. */
export function diagramLayoutEdges(nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[] {
  const diagram = nodes.find((node) => node.data.kind === "diagram");
  const summary = nodes.find((node) => node.data.kind === "summary") ?? nodes.find((node) => node.data.kind === "commit");
  if (!diagram || !summary) return edges;
  const predecessors = new Set(edges.map((edge) => edge.target));
  return [
    ...edges,
    { id: `layout:${summary.id}->${diagram.id}`, source: summary.id, target: diagram.id },
    ...nodes.filter((node) => node.data.kind === "change" && !predecessors.has(node.id))
      .map((node) => ({ id: `layout:${diagram.id}->${node.id}`, source: diagram.id, target: node.id })),
  ];
}

/** Adds ordering edges that stack a Change place's header and hunk cards in a column without drawing edges between them. */
export function changeLayoutEdges(nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[] {
  const column = nodes.filter((node) => node.data.kind === "changeHeader" || node.data.kind === "hunk");
  return [...edges, ...column.slice(1).map((node, index) => ({ id: `layout:${column[index]!.id}->${node.id}`, source: column[index]!.id, target: node.id }))];
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
  const sized = (s: PlacedNode, anchors: string[]) => ({ id: s.id, width: s.width, height: s.height, anchors });
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
