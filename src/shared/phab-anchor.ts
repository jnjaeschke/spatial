import type { Artifact, DiffData, Id, PatchNarrativeData, PhabCommentData, PhabSyncData } from "./types.ts";
import { numberLines } from "./diff-lines.ts";
import { epochNumber } from "./epochs.ts";
import { latestPhabComments, phabAnchorId } from "./phab-comments.ts";
import { reanchorFinding } from "./reanchor.ts";

/** Latest PhabSync recorded for a local Diff, or null. */
export function latestPhabSync(artifacts: Artifact[], diffArtifactId: Id): Artifact<PhabSyncData> | null {
  return artifacts.filter((artifact) => artifact.type === "PhabSync" && (artifact.data as PhabSyncData).localDiff === diffArtifactId).at(-1) as Artifact<PhabSyncData> | undefined ?? null;
}

export interface AnchoredPhabThread {
  anchorId: Id;
  anchor: string;
  path: string;
  line: number;
  side: "old" | "new";
  done: boolean;
  fromEpoch: number | null;
  comments: Artifact<PhabCommentData>[];
}
export interface PhabView {
  matchingDiffId: number | null;
  anchored: AnchoredPhabThread[];
  unanchored: { diffId: number | null; oldSide: boolean; outdatedEpoch: number | null; comments: Artifact<PhabCommentData>[] }[];
  general: Artifact<PhabCommentData>[];
}

/** Resolve remote comments against the latest local narrative and prior local epochs. */
export function phabView(artifacts: Artifact[], diff: Artifact<DiffData>, narrative: PatchNarrativeData): PhabView {
  const sync = latestPhabSync(artifacts, diff.id);
  const matchingDiffId = sync?.data.matchingDiffId ?? null;
  const diffs = artifacts.filter((artifact): artifact is Artifact<DiffData> => artifact.type === "Diff");
  const currentEpoch = epochNumber(artifacts, diff.id);
  const listed = new Set(narrative.changes.flatMap((change) => change.hunkIds));
  const currentRows = rowsByFile(diff.data);
  const latest = latestPhabComments(artifacts);
  const byPhid = new Map(latest.map((comment) => [comment.data.phid, comment]));
  const children = new Map<string, Artifact<PhabCommentData>[]>();
  for (const item of latest) if (item.data.replyTo && byPhid.has(item.data.replyTo)) children.set(item.data.replyTo, [...(children.get(item.data.replyTo) ?? []), item]);
  const commentsFor = (root: Artifact<PhabCommentData>) => [root, ...(children.get(root.data.phid) ?? []).sort((a, b) => a.data.txId - b.data.txId)];
  const roots = latest.filter((item) => !item.data.replyTo || !byPhid.has(item.data.replyTo));
  const anchored: AnchoredPhabThread[] = [];
  const groups = new Map<string, PhabView["unanchored"][number]>();
  const unanchor = (root: Artifact<PhabCommentData>, outdatedEpoch: number | null) => {
    const oldSide = root.data.isNewFile === false;
    const diffId = root.data.diffId ?? null;
    const key = JSON.stringify([diffId, oldSide, outdatedEpoch]);
    const group = groups.get(key) ?? { diffId, oldSide, outdatedEpoch, comments: [] };
    group.comments.push(...commentsFor(root));
    groups.set(key, group);
  };
  const placeable = (hunkId: string) => listed.has(hunkId);
  for (const root of roots) {
    const data = root.data;
    if (!data.path || data.line === undefined) continue;
    const thread = commentsFor(root);
    if (data.isNewFile === true && matchingDiffId !== null && data.diffId === matchingDiffId) {
      const row = currentRows.find((candidate) => candidate.pathMatches(data.path!) && candidate.rows.some((item) => item.line === data.line && item.side === "new" && (item.row.kind === "add" || item.row.kind === "ctx")));
      if (row) {
        const found = row.rows.find((item) => item.line === data.line && item.side === "new" && (item.row.kind === "add" || item.row.kind === "ctx"))!;
        if (placeable(found.hunkId)) {
          const anchorId = phabAnchorId(artifacts, data.phid);
          if (anchorId) anchored.push({ anchorId, anchor: `${diff.id}#${found.hunkId}`, path: row.path, line: data.line, side: "new", done: data.done, fromEpoch: null, comments: thread });
          continue;
        }
        unanchor(root, null);
        continue;
      }
    }
    const previous = diffs.filter((item) => item.id !== diff.id && epochNumber(artifacts, item.id) < currentEpoch && latestPhabSync(artifacts, item.id)?.data.matchingDiffId === data.diffId)
      .sort((a, b) => epochNumber(artifacts, b.id) - epochNumber(artifacts, a.id))[0];
    if (previous) {
      const source = rowsByFile(previous.data).find((candidate) => candidate.pathMatches(data.path!) && candidate.rows.some((item) => item.line === data.line && item.side === (data.isNewFile ? "new" : "old") && (data.isNewFile ? item.row.kind !== "del" : item.row.kind === "del")));
      const row = source?.rows.find((item) => item.line === data.line && item.side === (data.isNewFile ? "new" : "old") && (data.isNewFile ? item.row.kind !== "del" : item.row.kind === "del"));
      const oldEpoch = epochNumber(artifacts, previous.id);
      if (!source || !row) { unanchor(root, oldEpoch); continue; }
      const result = reanchorFinding({ quote: row.row.text, lines: { path: data.path, side: row.side, start: data.line, end: data.line }, oldHunks: [] }, diff.data);
      if (result && placeable(result.hunkId) && result.lines) {
        const anchorId = phabAnchorId(artifacts, data.phid);
        if (anchorId) anchored.push({ anchorId, anchor: `${diff.id}#${result.hunkId}`, path: result.lines.path, line: result.lines.start, side: row.side, done: data.done, fromEpoch: oldEpoch, comments: thread });
      } else unanchor(root, oldEpoch);
      continue;
    }
    unanchor(root, null);
  }
  const unanchored = [...groups.values()].sort((a, b) => (a.outdatedEpoch ?? -1) - (b.outdatedEpoch ?? -1) || (a.diffId ?? -1) - (b.diffId ?? -1));
  return { matchingDiffId, anchored, unanchored, general: roots.filter((item) => !item.data.path) };
}

function rowsByFile(diff: DiffData) {
  return diff.files.map((file) => ({ path: file.path, pathMatches: (path: string) => file.path === path || file.oldPath === path, rows: file.hunks.flatMap((hunk) => numberLines(hunk).map((row) => ({ row, hunkId: hunk.id, side: row.kind === "del" ? "old" as const : "new" as const, line: row.kind === "del" ? row.old! : row.new! }))) }));
}
