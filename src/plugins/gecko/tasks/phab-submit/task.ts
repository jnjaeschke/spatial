import { defineTask, type Id } from "../../../../plugin-api.ts";
import { type StackRewriteData } from "../../../implement/api.ts";
import { commitRevision } from "../../../review/api.ts";
import type { PhabSubmissionData, PhabSubmitInput } from "../../shared/types.ts";
import { assertAtTip, runRecorded } from "../../runtime/recorded-command.ts";
import { submitArgs } from "../../runtime/submit-command.ts";

export const phabSubmit = defineTask<PhabSubmitInput, { submissionId: Id }>({
  kind: "phabSubmit",
  async run(ctx, { base, head, reviewers, wip }) {
    const args = submitArgs({ base, reviewers, wip });
    await assertAtTip(ctx, head, "submitting");
    const command = ["moz-phab", ...args].join(" ");
    await runRecorded(ctx, "moz-phab", command, process.env.SPATIAL_MOZPHAB ?? "moz-phab", args);
    const after = await ctx.git.resolve("HEAD");
    const revisions = (await ctx.git.log(base, after)).map((commit) => {
      const revision = commitRevision(commit);
      if (!revision) throw new Error(`moz-phab finished, but commit ${commit.sha.slice(0, 12)} (${commit.subject}) has no Differential Revision trailer`);
      return { sha: commit.sha, subject: commit.subject, url: `${revision.host}/D${revision.id}` };
    });
    ctx.artifacts.put<StackRewriteData>("StackRewrite", "verified", { from: head, to: after, by: "moz-phab submit" });
    return { submissionId: ctx.artifacts.put<PhabSubmissionData>("PhabSubmission", "verified", { command, head: after, revisions }).id };
  },
});
