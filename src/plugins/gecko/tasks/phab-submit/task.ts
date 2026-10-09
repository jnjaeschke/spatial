import { defineTask, runProcess, type Id } from "../../../../plugin-api.ts";
import { commandRunData, type CommandRunData } from "../../../implement/api.ts";
import { commitRevision } from "../../../review/api.ts";
import type { PhabSubmissionData, PhabSubmitInput } from "../../shared/types.ts";
import { submitArgs } from "../../runtime/submit-command.ts";

export const phabSubmit = defineTask<PhabSubmitInput, { submissionId: Id }>({
  kind: "phabSubmit",
  async run(ctx, { base, head, reviewers, wip }) {
    const args = submitArgs({ base, reviewers, wip });
    const tip = await ctx.git.resolve("HEAD");
    if (tip !== head) throw new Error(`The checkout is at ${tip.slice(0, 12)}, not at the accepted tip ${head.slice(0, 12)}; spatial does not move the checkout`);
    if (await ctx.git.isDirty()) throw new Error("The work tree has uncommitted changes; commit or stash them before submitting");
    const command = ["moz-phab", ...args].join(" ");
    const started = Date.now();
    const out = await runProcess(process.env.SPATIAL_MOZPHAB ?? "moz-phab", args, { stdin: "", cwd: ctx.repo, signal: ctx.signal, onStdoutLine: (line) => { if (line.trim()) ctx.progress({ kind: "indeterminate", message: line.trim() }); } });
    const output = out.stderr ? `${out.stdout}\n${out.stderr}` : out.stdout;
    ctx.artifacts.put<CommandRunData>("CommandRun", "verified", commandRunData(command, out.code, Date.now() - started, output, false));
    if (out.code !== 0) throw new Error(`moz-phab exited ${out.code}; its output is in the command run`);
    const after = await ctx.git.resolve("HEAD");
    const revisions = (await ctx.git.log(base, after)).map((commit) => {
      const revision = commitRevision(commit);
      if (!revision) throw new Error(`moz-phab finished, but commit ${commit.sha.slice(0, 12)} (${commit.subject}) has no Differential Revision trailer`);
      return { sha: commit.sha, subject: commit.subject, url: `${revision.host}/D${revision.id}` };
    });
    return { submissionId: ctx.artifacts.put<PhabSubmissionData>("PhabSubmission", "verified", { command, head: after, revisions }).id };
  },
});
