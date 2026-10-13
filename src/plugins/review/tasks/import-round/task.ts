import { type Id, defineTask } from "../../../../plugin-api.ts";
import type { PhabSyncData } from "../../shared/types.ts";
import { commitStack, revisionConduit } from "../../runtime/import-revision.ts";
import type { RoundSource } from "../../workflow/round.ts";

/** Imports a Phabricator or local round as a Diff and records its Phabricator matches. */
export const importRound = defineTask<{ round: RoundSource }, { diffId: Id }>({
  kind: "importRound",
  async run(ctx, { round }) {
    let base: string, head: string;
    if (round.kind === "local") ({ base, head } = round);
    else {
      const host = round.host.replace(/\/+$/, "");
      const conduit = revisionConduit(host);
      const patches = [];
      for (const entry of round.stack) patches.push({ revision: { id: entry.revision, title: entry.title }, diff: { id: entry.diffId, dateCreated: entry.dateCreated }, raw: await conduit.call<string>("differential.getrawdiff", { diffID: entry.diffId }) });
      base = await ctx.git.resolve(round.stack[0]!.base);
      head = await commitStack(ctx.repo, host, base, patches);
    }
    const { diffId } = await ctx.run<{ diffId: Id }>("importDiff", { base, head });
    for (const entry of (round.kind === "local" ? round.phab : round.stack) ?? []) {
      ctx.artifacts.put<PhabSyncData>("PhabSync", "verified", { revision: entry.revision, matchingDiffId: entry.diffId, latestDiffId: entry.latestDiffId, localDiff: diffId });
    }
    return { diffId };
  },
});
