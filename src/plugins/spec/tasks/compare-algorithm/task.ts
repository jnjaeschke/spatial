import { defineTask, type Id } from "../../../../plugin-api.ts";
import type { Engine } from "../../shared/types.ts";
import type { EngineComparison, SpecAlgorithmData, StoredComparison } from "../../shared/types.ts";
import { numbered, shiftSteps, siteName, usedSites } from "../../shared/engine.ts";
import { parseSteps } from "../../shared/steps.ts";
import { citedEvidence, comparisonErrors, type ComparedFiles } from "../../shared/compare-check.ts";
import type { CompareInput } from "../compare-engines/task.ts";
import type { Verdict } from "../verdicts.ts";
import { storedMapping } from "../../runtime/mappings.ts";
import { siteAtTip } from "../../runtime/engine-map.ts";
import { mappingDigest } from "../../runtime/compare.ts";
import { specServices } from "../../runtime/services.ts";

/** Compares an algorithm's implementations in `engines`: reads each engine's first three sites where their quotes are now (fails when one is gone), runs `compareEngines`, drops the differences the deterministic check refuses, and keeps those `verifyComparison` supports. Returns the comparison to store with a digest per engine of the sites it used; `startCompare` stores it. */
export const compareAlgorithm = defineTask<{ algorithmId: Id; engines: Engine[] }, StoredComparison>({
  kind: "compareAlgorithm",
  async run(ctx, { algorithmId, engines }) {
    const algorithm = ctx.artifacts.get<SpecAlgorithmData>(algorithmId).data;
    const mappings = engines.map((engine) => ({ engine, mapping: storedMapping(ctx.knowledge, engine, algorithm.ref) }));
    const files: ComparedFiles = {}, compared: CompareInput["engines"] = [];
    for (const { engine, mapping } of mappings) {
      const known = files[engine] ??= {}, sites: CompareInput["engines"][number]["sites"] = [];
      for (const site of usedSites(mapping).slice(0, 3)) {
        const found = await siteAtTip(specServices(ctx).codeSearch[engine], site, ctx.signal);
        if (!found) throw new Error(`${engine} ${site.path}:${site.line} no longer reads \`${site.quote}\`; refresh the mapping`);
        const { lines, at, fn } = found;
        known[site.path] = lines;
        sites.push({ path: site.path, name: siteName(site), source: numbered(lines, at, Math.min(fn?.end ?? at, at + 199)), steps: shiftSteps(site.steps, at - site.line).map((step) => ({ step: step.step, line: step.line, end: step.end ?? step.line })) });
      }
      compared.push({ engine, sites });
    }
    const basedOn = Object.fromEntries(mappings.map(({ engine, mapping }) => [engine, mappingDigest(mapping)])) as Partial<Record<Engine, string>>;
    const comparison = await ctx.run<EngineComparison>("compareEngines", { algorithmId, engines: compared } satisfies CompareInput);
    const steps = parseSteps(algorithm.content);
    const checked = comparison.differences.filter((difference) => !comparisonErrors(difference, steps, files).length);
    let kept = checked;
    if (checked.length) {
      const verdicts = await ctx.run<{ differences: Verdict[] }>("verifyComparison", { algorithmId, differences: checked, evidence: checked.map((difference) => citedEvidence(difference, steps, files)) });
      kept = checked.filter((_, index) => verdicts.differences[index]!.supported);
    }
    return { comparison: { differences: kept }, dropped: comparison.differences.length - kept.length, basedOn };
  },
});
