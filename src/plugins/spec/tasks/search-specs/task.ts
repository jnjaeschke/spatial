import { defineTask, type Id } from "../../../../plugin-api.ts";
import type { SpecSearchData } from "../../shared/types.ts";
import { specRef } from "../../shared/refs.ts";

/** Searches webspec-index and stores the 8 best distinct sections as a `SpecSearch`. */
export const searchSpecs = defineTask<{ phrase: string }, { searchId: Id }>({
  kind: "searchSpecs",
  async run(ctx, { phrase }) {
    const seen = new Set<string>();
    const results = (await ctx.webspec.search(phrase, ctx.signal)).filter((r) => !seen.has(specRef(r.spec, r.anchor)) && seen.add(specRef(r.spec, r.anchor))).slice(0, 8);
    return { searchId: ctx.artifacts.put<SpecSearchData>("SpecSearch", "verified", { phrase, results }).id };
  },
});
