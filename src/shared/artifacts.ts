import type { Artifact } from "./types.ts";

/** The latest artifact of `type`, in `epoch` when given. */
export function latestArtifact<T = unknown>(artifacts: Artifact[], type: string, epoch?: number): Artifact<T> | undefined {
  return artifacts.findLast((a) => a.type === type && (epoch === undefined || a.epoch === epoch)) as Artifact<T> | undefined;
}
