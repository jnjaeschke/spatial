import type { DiffData } from "../shared/types.ts";
import type { SessionView } from "./render-ref.ts";

/** The revision a session's code links point at: the newest Diff's `upstreamRev`, else the first plugin `linkRev` hook answer; null when none is known. */
export function selectLinkRev(view: SessionView, hooks: ((view: SessionView) => string | null)[]): string | null {
  const diff = view.artifacts.findLast((artifact) => artifact.type === "Diff" && typeof (artifact.data as DiffData).upstreamRev === "string");
  if (diff) return (diff.data as DiffData).upstreamRev!;
  for (const hook of hooks) {
    const rev = hook(view);
    if (rev) return rev;
  }
  return null;
}
