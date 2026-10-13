import { defineTask, type Id } from "../../../../plugin-api.ts";
import type { Engine } from "../../shared/types.ts";
import type { EngineMapping, SpecAlgorithmData } from "../../shared/types.ts";
import { parseSteps } from "../../shared/steps.ts";
import { byPlace, keepAlignedSteps } from "../../shared/engine.ts";
import { storedMapping } from "../../runtime/mappings.ts";
import { addSteps, carryOver, specLinkSites } from "../../runtime/engine-map.ts";
import { specServices } from "../../runtime/services.ts";

/** Maps an algorithm to an engine at its code search's current revision: spec-link comments to sites (tier 1), Step comments to steps (tier 2); the previous mapping's proposals, confirmations and rejections carry over. */
export const mapEngine = defineTask<{ algorithmId: Id; engine: Engine }, EngineMapping>({
  kind: "mapEngine",
  async run(ctx, { algorithmId, engine }) {
    const algorithm = ctx.artifacts.get<SpecAlgorithmData>(algorithmId).data;
    const search = specServices(ctx).codeSearch[engine];
    const previous = storedMapping(ctx.knowledge, engine, algorithm.ref);
    const { repoBase, rev } = await search.tip();
    const tier1 = await specLinkSites(search, algorithm, ctx.signal);
    const sites = parseSteps(algorithm.content).length ? await addSteps(search, (name, text, signal) => specServices(ctx).webspec.analyze(name, text, signal), algorithm.anchor, tier1.sites, tier1.files, ctx.signal) : tier1.sites;
    const file = async (path: string) => tier1.files.get(path) ?? (await search.file(path, ctx.signal))?.split("\n") ?? null;
    const carried = previous ? await carryOver(file, previous.sites, sites) : [];
    const linked = previous ? keepAlignedSteps(previous.sites, sites) : sites;
    return { engine, repoBase, rev, sites: [...linked, ...carried].sort(byPlace), tests: tier1.tests, rejected: previous?.rejected ?? [], checkedAt: new Date().toISOString() };
  },
});
