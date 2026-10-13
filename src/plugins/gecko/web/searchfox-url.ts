import type { Artifact, SessionState } from "../../../web/plugin-api.ts";
import type { CodeLinks } from "../../../web/plugin-api.ts";
import type { CodeLinksData, GeckoSessionState } from "../shared/types.ts";
import { fileUrl } from "../shared/searchfox-url.ts";

export function mergedCodeLinks(artifacts: Artifact[], rev: string): Record<string, string | null> {
  const links: Record<string, string | null> = {};
  for (const artifact of artifacts) {
    if (artifact.type !== "CodeLinks") continue;
    const data = artifact.data as CodeLinksData;
    if (data.rev === rev) Object.assign(links, data.links);
  }
  return links;
}

/** Searchfox links for a Gecko session; null for other sessions. Without a known upstream revision, file links point at Searchfox's current tip and tokens are not linked. `resolved` holds tokens answered since the snapshot. */
export function searchfoxCodeLinks(state: SessionState, resolved: Record<string, string | null>, request: CodeLinks["request"]): CodeLinks | null {
  const gecko = state.plugins.gecko as GeckoSessionState | undefined;
  if (!gecko) return null;
  const exact = gecko.linkRev !== null;
  const base = { repoBase: gecko.repoBase, rev: gecko.linkRev ?? gecko.tipRev };
  const links = { ...mergedCodeLinks(state.artifacts, base.rev), ...resolved };
  return {
    fileUrl: (path, line, side = "old") => side === "old" ? fileUrl(base, path, line) : null,
    tokenUrl: (token) => exact ? links[token] ?? null : null,
    request: (tokens) => { if (exact) request(tokens); },
    label: "Searchfox",
    title: exact ? "Searchfox at the patch's base" : "Searchfox at current mozilla-central; line numbers may differ",
  };
}
