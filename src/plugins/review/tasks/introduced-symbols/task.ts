import { type DiffData, type Id, defineTask } from "../../../../plugin-api.ts";
import type { IntroducedSymbolsData } from "../../shared/types.ts";
import { addedIdentifiers, definitionSites } from "../../runtime/introduced-symbols.ts";

/** Records added identifiers absent from the base tree when an added line looks like their definition. */
export const introducedSymbols = defineTask<{ diffId: Id }, { artifactId: Id }>({
  kind: "introducedSymbols",
  async run(ctx, { diffId }) {
    const artifact = ctx.artifacts.get<DiffData>(diffId);
    if (artifact.type !== "Diff") throw new Error(`Artifact ${diffId} is not a Diff (got ${artifact.type})`);
    const diff = artifact.data;
    // Common words make the tree-wide grep slow (tens of seconds in Gecko); the base versions of the touched files already contain most of them.
    const local = new Set<string>();
    for (const file of diff.files) {
      if (file.status === "added" || file.binary) continue;
      for (const match of (await ctx.git.show(diff.baseSha, file.oldPath ?? file.path)).matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) local.add(match[0]);
    }
    const names = addedIdentifiers(diff).filter((name) => !local.has(name));
    const existing = await ctx.git.wordsAt(diff.baseSha, names);
    const symbols: IntroducedSymbolsData["symbols"] = {};
    for (const name of names) {
      if (existing.has(name)) continue;
      const sites = definitionSites(diff, name);
      if (sites.length) symbols[name] = { sites };
    }
    const result = ctx.artifacts.put<IntroducedSymbolsData>("IntroducedSymbols", "verified", { diffId, symbols });
    ctx.links.put(result.id, diffId, "derivedFrom");
    return { artifactId: result.id };
  },
});
