import { z } from "zod";
import { type Workflow, type WorkflowStartData, makeGitWriter, plural } from "../../../plugin-api.ts";
import { implementCheckAnswer, implementNext, isActive } from "./next.ts";

const params = z.strictObject({
  request: z.string().min(1).describe("The bug fix or feature request as the user wrote it."),
  profile: z.string().nullable().describe("Id of the repo profile that fits this repository (see Repo profiles); null when unsure."),
  checkout: z.enum(["new-branch", "current-branch"]).nullable().describe("current-branch when the request or an answer says to resume or continue on the current branch, new-branch when it says to start fresh; otherwise null."),
});
type Params = z.infer<typeof params>;
const isMainline = (branch: string | null) => branch === "main" || branch === "master";

/** Starts implementation work after resolving the checkout and repo profile. */
export const implementWorkflow: Workflow<Params> = {
  id: "implement",
  description: "Implement a bug fix or a feature: investigate the code, get the plan approved, write the change as commits on a new branch in this checkout, review it, and revise until the user accepts. Use it for requests like \"fix bug …\", \"implement …\", \"add …\" and \"resume …\".",
  argHint: "<what to fix or build>",
  params,
  next: implementNext,
  checkAnswer: implementCheckAnswer,
  parseArgs: (args) => args.trim() ? { ok: true, params: { request: args.trim(), profile: null, checkout: null } } : { ok: false, error: "Usage: /implement <what to fix or build>" },
  async precheck(repo, p) {
    if (p.checkout !== null) return null;
    const writer = makeGitWriter(repo);
    const [branch, changed] = await Promise.all([writer.currentBranch(), writer.changedFiles()]);
    if (changed === 0 && isMainline(branch)) return null;
    const where = branch ? `on branch \`${branch}\`` : "on a detached HEAD";
    const question = changed
      ? `The checkout has uncommitted changes in ${plural(changed, "file")} (${where}).`
      : `The checkout is ${where}, not on main.`;
    // `git switch -c` carries uncommitted changes over; the old branch's commits stay behind.
    return { question, options: [
      ...(branch ? [{ label: changed ? `Continue on ${branch} with the uncommitted changes` : `Continue on ${branch}`, params: { checkout: "current-branch" as const } }] : []),
      { label: changed ? "New branch from the default branch, carrying the uncommitted changes over" : "Start fresh on a new branch from the default branch", params: { checkout: "new-branch" as const } },
      { label: "Cancel" },
    ] };
  },
  async start(rt, sessionId, { params: p, startId }) {
    const worktree = rt.store.getSession(sessionId).worktree;
    const busy = rt.store.listSessions().find((s) => s.id !== sessionId && s.worktree === worktree && s.workflow === "implement" && isActive(rt, s.id));
    if (busy) {
      const last = rt.store.listEpochs(busy.id).at(-1);
      const state = last ? `${last.phase} ${last.status}` : "waiting for a decision";
      const message = `Checkout ${worktree} is in use by the implement session ${busy.id} (${state})`;
      rt.emit(sessionId, "runtime", "notify", { id: "implement-busy", title: "Checkout in use", body: message, action: { label: "Abandon that session", path: `/api/sessions/${busy.id}/abandon` } });
      throw new Error(message);
    }
    const writeMode = rt.store.getArtifact<WorkflowStartData>(startId).data.writeMode;
    await rt.run(sessionId, "implementStart", { request: p.request, profile: p.profile, checkout: p.checkout ?? "new-branch", ...(writeMode ? { writeMode } : {}) });
  },
};
