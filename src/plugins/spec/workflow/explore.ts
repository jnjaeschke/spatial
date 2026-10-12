import { z } from "zod";
import type { Artifact, DecisionData, Id, Phase, Workflow } from "../../../plugin-api.ts";
import type { SpecSearchData } from "../shared/types.ts";
import { isSpecQuery, specRef } from "../shared/refs.ts";
import { openSpec } from "../runtime/open.ts";

const params = z.strictObject({ query: z.string() });
interface ExploreInput { query: string }

/** Opens a section as the root box, or searches a phrase; a search asks which result to open and runs again with it. */
export const explorePhase: Phase<ExploreInput> = {
  id: "explore",
  async run(rt, sessionId, { query }) {
    if (isSpecQuery(query)) { await openSpec(rt, sessionId, query, null); return; }
    const { searchId } = await rt.run<{ searchId: Id }>(sessionId, "searchSpecs", { phrase: query });
    if (!rt.store.getArtifact<SpecSearchData>(searchId).data.results.length) throw new Error(`No spec section matches "${query}"`);
  },
  next(view, epoch) {
    const search = view.artifacts.findLast((a) => a.type === "SpecSearch" && a.epoch === epoch.n) as Artifact<SpecSearchData> | undefined;
    if (!search) return null;
    const question = `Which section for "${search.data.phrase}"?`;
    const decision = view.artifacts.findLast((a) => a.type === "Decision" && a.epoch === epoch.n && (a.data as DecisionData).key === "section") as Artifact<DecisionData> | undefined;
    if (decision?.data.chosen) return { run: "explore", input: { query: decision.data.chosen.option } };
    return { decide: { key: "section", question, options: search.data.results.map((r) => ({ id: specRef(r.spec, r.anchor), label: `${r.title} (${specRef(r.spec, r.anchor)})` })) } };
  },
};

export const exploreWorkflow: Workflow<z.infer<typeof params>> = {
  id: "explore", description: "Explore web spec algorithms: open a section by SPEC#anchor or URL, or search for one, and follow its links.", argHint: "<SPEC#anchor | URL | search phrase>", params,
  parseArgs: (args) => args.trim() ? { ok: true, params: { query: args.trim() } } : { ok: false, error: "Usage: /explore <SPEC#anchor | URL | search phrase>" },
  async start(rt, sessionId, { params: { query } }) { await rt.runPhase(sessionId, "explore", { query }); },
};
