import { defineTask, latestArtifact, type DiffData, type Id } from "../../../../plugin-api.ts";
import { commitRevision, fetchRevisionHistory, revisionConduit, type RoundDiff } from "../../../review/api.ts";
import type { AdoptBranch, AdoptInput, AdoptPlanData, ImplementBranchData } from "../../shared/types.ts";
import { adoptBase, recentBranches, relatedBranches } from "../../runtime/adopt.ts";
import { sessionBug } from "../../workflow/next.ts";

/** Finds what an adopt can take over: candidate branches with their commits, and the Phabricator history of the revisions their trailers name. Reads git and Conduit only. */
export const adoptPlan = defineTask<AdoptInput, { planId: Id }>({
  kind: "adoptPlan",
  async run(ctx, input) {
    const view = ctx.artifacts.view();
    const branch = latestArtifact<ImplementBranchData>(view.artifacts, "ImplementBranch");
    if (!branch) throw new Error("The session has no implement branch");
    const refs = [branch.data.baseRef, branch.data.baseSha, ...await ctx.git.mainlineRefs()].filter((ref): ref is string => !!ref);
    const all = await ctx.git.branches();
    let names: string[], refError: string | null = null;
    if (input.mode === "moved") names = [branch.data.branch];
    else if (input.mode === "renamed") {
      const known = new Set<string>();
      for (const diff of view.artifacts.filter((a) => a.type === "Diff") as { data: DiffData }[]) {
        for (const item of await ctx.git.patchIds(diff.data.baseSha, diff.data.headSha).catch(() => [])) known.add(item.patchId);
      }
      names = await relatedBranches(ctx.git, all, { refs, bug: sessionBug(view), knownPatchIds: known });
    } else if (input.ref !== undefined && all.some((b) => b.name === input.ref)) names = [input.ref];
    else {
      if (input.ref !== undefined) refError = `Branch ${input.ref} does not exist`;
      names = recentBranches(all);
    }
    const branches: AdoptBranch[] = [];
    for (const name of names) {
      const tip = all.find((b) => b.name === name)!.sha;
      const base = await adoptBase(ctx.git, refs, tip);
      if (base) branches.push({ branch: name, base, tip, commits: (await ctx.git.log(base, tip)).slice(-200) });
    }
    const trailers = branches.flatMap((b) => b.commits).map(commitRevision).filter((r) => r !== null);
    const host = trailers[0]?.host ?? null;
    const ids = [...new Set(trailers.filter((r) => r.host === host).map((r) => r.id))];
    let history: Awaited<ReturnType<typeof fetchRevisionHistory>> = [], historyError: string | null = null;
    // Without Phabricator access the local commits can still be adopted; the rounds are what is lost.
    if (host && ids.length) {
      try { history = await fetchRevisionHistory(revisionConduit(host), ids); }
      catch (e) { historyError = (e as Error).message; }
    }
    const diffs: RoundDiff[] = history.flatMap(({ revision, diffs }) => diffs.map((d) => ({ revision: revision.id, diffId: d.id, base: d.base, dateCreated: d.dateCreated })));
    const missingBases: string[] = [];
    for (const base of new Set(diffs.map((d) => d.base))) await ctx.git.resolve(base).catch(() => missingBases.push(base));
    const data: AdoptPlanData = { mode: input.mode, host, branches, revisions: history.map(({ revision, diffs }) => ({ id: revision.id, title: revision.title, latestDiffId: diffs[0]!.id })), diffs, missingBases, refError, historyError };
    return { planId: ctx.artifacts.put<AdoptPlanData>("AdoptPlan", "verified", data).id };
  },
});
