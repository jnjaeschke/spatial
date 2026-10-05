import { createContext } from "react";
import type { DiffData, SessionState } from "../shared/types.ts";

/** Where Searchfox links point. `exact` false means the patch's upstream revision is unknown and `rev` is Searchfox's current tip. */
export interface SearchfoxLinks { repoBase: string; rev: string; exact: boolean }

export const SearchfoxContext = createContext<SearchfoxLinks | null>(null);

export function searchfoxLinks(state: SessionState, diff: DiffData): SearchfoxLinks | null {
  if (!state.searchfox) return null;
  return {
    repoBase: state.searchfox.repoBase,
    rev: diff.upstreamRev ?? state.searchfox.tipRev,
    exact: diff.upstreamRev !== undefined,
  };
}

export function fileUrl(sf: SearchfoxLinks, path: string, line?: number): string {
  return `${sf.repoBase}rev/${sf.rev}/${path}${line === undefined ? "" : `#${line}`}`;
}

export function searchUrl(sf: SearchfoxLinks, token: string): string {
  return `${sf.repoBase}search?q=${encodeURIComponent(token.replace(/\(.*\)$/, ""))}`;
}

export function linkTitle(sf: SearchfoxLinks): string {
  return sf.exact ? "Searchfox at the patch's base" : "Searchfox at current mozilla-central; line numbers may differ";
}
