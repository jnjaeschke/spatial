import type { GitCapability, RepoProfile } from "../../../plugin-api.ts";

/** What the stack must satisfy. `plan` is null when it is not enforced (resumed branches); `planChange` is the agent's reported reason for deviating. */
export interface StackCheck { baseSha: string; branch: string; plan: { message: string }[] | null; planChange: string | null; profile: Pick<RepoProfile, "commitStyle" | "messageCheck"> }

const core = (subject: string) => subject.replace(/^Bug (?:\d+|N) - /i, "").replace(/ r[?=]\S+$/, "").trim().toLowerCase();

/** Deterministic check of the branch after an agent run: on the branch, descends from the base, matches the plan and the profile's message rule, work tree clean. Returns the tip and the problems to hand back to the agent. */
export async function verifyStack(git: Pick<GitCapability, "resolve" | "isAncestor" | "isDirty" | "log">, currentBranch: string | null, check: StackCheck): Promise<{ head: string; problems: string[] }> {
  const problems: string[] = [];
  if (currentBranch !== check.branch) problems.push(`HEAD is on ${currentBranch ?? "a detached HEAD"}, not on ${check.branch}`);
  const head = await git.resolve("HEAD");
  if (!(await git.isAncestor(check.baseSha, head))) problems.push(`${check.branch} no longer descends from the base ${check.baseSha.slice(0, 12)}`);
  else {
    const commits = await git.log(check.baseSha, head);
    if (commits.length === 0) problems.push("The branch has no commits on top of the base");
    if (check.profile.commitStyle === "single" && commits.length > 1) problems.push(`Expected a single commit, found ${commits.length}; squash them`);
    if (check.profile.commitStyle === "stack" && check.plan && !check.planChange) {
      if (commits.length !== check.plan.length) problems.push(`The plan has ${check.plan.length} steps but the branch has ${commits.length} commits; follow the plan or report a plan change with its reason`);
      else commits.forEach((commit, index) => {
        const planned = check.plan![index]!.message.split("\n", 1)[0]!;
        if (core(commit.subject) !== core(planned)) problems.push(`Commit ${index + 1} "${commit.subject}" does not match the plan step "${planned}"`);
      });
    }
    for (const commit of commits) {
      const problem = check.profile.messageCheck?.(commit.subject);
      if (problem) problems.push(`${commit.sha.slice(0, 12)} "${commit.subject}": ${problem}`);
    }
  }
  if (await git.isDirty()) problems.push("The work tree has uncommitted changes; commit them or revert them");
  return { head, problems };
}
