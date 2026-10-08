import type { Artifact, DiffData, NotifyPayload } from "../../../plugin-api.ts";

/** A revision notice is stale once its head is the latest imported Diff. */
export function isStaleNotice(n: NotifyPayload, latest: Artifact<DiffData> | null): boolean {
  return latest !== null && n.id === `revision:${latest.data.headSha}`;
}
