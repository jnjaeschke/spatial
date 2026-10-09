import { createContext } from "react";
import type { Artifact, CodeLinksData, DiffData, SessionState } from "../shared/types.ts";

/** Where Searchfox links point. `exact` false means the patch's upstream revision is unknown and `rev` is Searchfox's current tip. */
export interface SearchfoxLinks { repoBase: string; rev: string; exact: boolean; links: Record<string, string | null>; request(token: string): void }

export const SearchfoxContext = createContext<SearchfoxLinks | null>(null);

export function mergedCodeLinks(artifacts: Artifact[], rev: string): Record<string, string | null> {
  const links: Record<string, string | null> = {};
  for (const artifact of artifacts) {
    if (artifact.type !== "CodeLinks") continue;
    const data = artifact.data as CodeLinksData;
    if (data.rev === rev) Object.assign(links, data.links);
  }
  return links;
}

export function searchfoxLinks(state: SessionState, diff: DiffData, request: SearchfoxLinks["request"]): SearchfoxLinks | null {
  if (!state.searchfox) return null;
  const rev = diff.upstreamRev ?? state.searchfox.tipRev;
  return {
    repoBase: state.searchfox.repoBase,
    rev,
    exact: diff.upstreamRev !== undefined,
    links: mergedCodeLinks(state.artifacts, rev),
    request,
  };
}

export function fileUrl(sf: SearchfoxLinks, path: string, line?: number): string {
  return `${sf.repoBase}rev/${sf.rev}/${path}${line === undefined ? "" : `#${line}`}`;
}

export function linkTitle(sf: SearchfoxLinks): string {
  return sf.exact ? "Searchfox at the patch's base" : "Searchfox at current mozilla-central; line numbers may differ";
}
