import { defineTask, latestArtifact, type Id } from "../../../../plugin-api.ts";
import type { AdoptPlanData, AdoptRangeInput, ImplementBranchData, ImplementResultData } from "../../shared/types.ts";

/** Records an adopted range as the session's current branch and result. */
export const adoptRange = defineTask<AdoptRangeInput, { resultId: Id }>({
  kind: "adoptRange",
  async run(ctx, { planId, branch, head }) {
    const plan = ctx.artifacts.get<AdoptPlanData>(planId, "AdoptPlan").data;
    const chosen = plan.branches.find((b) => b.branch === branch);
    if (!chosen || !chosen.commits.some((c) => c.sha === head)) throw new Error(`${head} is not on ${branch} in the adopt plan`);
    const previous = latestArtifact<ImplementBranchData>(ctx.artifacts.view().artifacts, "ImplementBranch");
    if (!previous) throw new Error("The session has no implement branch");
    ctx.artifacts.put<ImplementBranchData>("ImplementBranch", "verified", { ...previous.data, branch, baseSha: chosen.base });
    const result = ctx.artifacts.put<ImplementResultData>("ImplementResult", "verified", { head, branch, summary: `Adopted from ${branch}`, planChange: null, planInvalid: null });
    return { resultId: result.id };
  },
});
