import { createContext } from "react";
import type { Artifact, CodeLinksData, SessionState } from "../shared/types.ts";

/** Where Searchfox links point. `exact` false means the session's upstream revision is unknown and `rev` is Searchfox's current tip. */
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

export function searchfoxLinks(state: SessionState, request: SearchfoxLinks["request"]): SearchfoxLinks | null {
  if (!state.searchfox) return null;
  const rev = state.searchfox.linkRev ?? state.searchfox.tipRev;
  return {
    repoBase: state.searchfox.repoBase,
    rev,
    exact: state.searchfox.linkRev !== null,
    links: mergedCodeLinks(state.artifacts, rev),
    request,
  };
}

export { fileUrl } from "../shared/searchfox-url.ts";

export function linkTitle(sf: SearchfoxLinks): string {
  return sf.exact ? "Searchfox at the patch's base" : "Searchfox at current mozilla-central; line numbers may differ";
}
