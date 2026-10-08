import type { PhabCommentData } from "./types.ts";
import type { Artifact, Id } from "../../../plugin-api.ts";

/** Latest artifact of every remote comment by `phid`: highest version, then newest. */
export function latestByPhid(artifacts: Artifact[]): Map<string, Artifact<PhabCommentData>> {
  const latest = new Map<string, Artifact<PhabCommentData>>();
  for (const artifact of artifacts) {
    if (artifact.type !== "PhabComment") continue;
    const candidate = artifact as Artifact<PhabCommentData>;
    const current = latest.get(candidate.data.phid);
    if (!current || candidate.data.version >= current.data.version) {
      latest.set(candidate.data.phid, candidate);
    }
  }
  return latest;
}

/** Latest artifact of every remote comment (highest version, then newest), not own, ascending `txId`. */
export function latestPhabComments(artifacts: Artifact[]): Artifact<PhabCommentData>[] {
  return [...latestByPhid(artifacts).values()].filter((artifact) => !artifact.data.own).sort((a, b) => a.data.txId - b.data.txId);
}

/** Id of the first stored Phabricator comment artifact of `phid`. */
export function phabAnchorId(artifacts: Artifact[], phid: string): Id | undefined {
  return artifacts.find((artifact) => artifact.type === "PhabComment" && (artifact.data as PhabCommentData).phid === phid)?.id;
}

/** Latest artifact of the comment whose first artifact is `anchorId`. */
export function phabLatest(artifacts: Artifact[], anchorId: Id): Artifact<PhabCommentData> | null {
  const first = artifacts.find((artifact) => artifact.id === anchorId && artifact.type === "PhabComment") as Artifact<PhabCommentData> | undefined;
  return first ? latestByPhid(artifacts).get(first.data.phid) ?? null : null;
}

/** Root comment followed by its visible replies in transaction order. */
export function phabThread(artifacts: Artifact[], anchorId: Id): Artifact<PhabCommentData>[] {
  const latest = latestByPhid(artifacts);
  const anchor = artifacts.find((artifact) => artifact.id === anchorId && artifact.type === "PhabComment") as Artifact<PhabCommentData> | undefined;
  if (!anchor) return [];
  let root = latest.get(anchor.data.phid)!;
  const visited = new Set<string>();
  while (root.data.replyTo && !visited.has(root.data.phid)) {
    visited.add(root.data.phid);
    const parent = latest.get(root.data.replyTo);
    if (!parent) break;
    root = parent;
  }
  if (root.data.own) return [];
  return [root, ...[...latest.values()].filter((item) => !item.data.own && item.data.replyTo === root.data.phid).sort((a, b) => a.data.txId - b.data.txId)];
}
