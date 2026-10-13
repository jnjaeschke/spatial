import type { DiffData, SessionView } from "../../../plugin-api.ts";
import type { ImplementBranchData } from "../../implement/api.ts";

/** The upstream revision a session's code links point at: the newest review diff's, else the implement branch's base; null when neither is known. */
export function linkRev(view: SessionView): string | null {
  const diffRev = (view.artifacts.findLast((artifact) => artifact.type === "Diff")?.data as DiffData | undefined)?.upstreamRev;
  return diffRev ?? (view.artifacts.findLast((artifact) => artifact.type === "ImplementBranch")?.data as ImplementBranchData | undefined)?.baseSha ?? null;
}
