import { z } from "zod";
import { type Id, type Runtime, type Session, type Workflow, type WorkflowStartData, makeGit, makeGitWriter, plural } from "../../../plugin-api.ts";
import { nearestFork } from "../../review/api.ts";
import type { AdoptInput } from "../shared/types.ts";
import { implementCheckAnswer, implementNext, isActive } from "./next.ts";

const params = z.strictObject({
  request: z.string().min(1).describe("The bug fix or feature request as the user wrote it."),
  profile: z.string().nullable().describe("Id of the repo profile that fits this repository (see Repo profiles); null when unsure."),
  checkout: z.enum(["new-branch", "current-branch", "adopt-branch"]).nullable().describe("adopt-branch when the request says to pick up, take over or continue existing work or a patch already in review on the current branch; current-branch when it says to resume or continue on the current branch with new work; new-branch when it says to start fresh; otherwise null."),
});
type Params = z.infer<typeof params>;
const isMainline = (branch: string | null) => branch === "main" || branch === "master";

/** Another implement session that still works in `worktree`: one checkout holds one implement branch at a time. */
function busyCheckout(rt: Runtime, worktree: string, sessionId?: Id): { session: Session; message: string } | null {
  const session = rt.store.listSessions().find((s) => s.id !== sessionId && s.worktree === worktree && s.workflow === "implement" && isActive(rt, s.id));
  if (!session) return null;
  const last = rt.store.listEpochs(session.id).at(-1);
  const state = last ? `${last.phase} ${last.status}` : "waiting for a decision";
  return { session, message: `Checkout ${worktree} is in use by the implement session "${session.title}" ${session.id} (${state})` };
}

/** Starts implementation work after resolving the checkout and repo profile. */
export const implementWorkflow: Workflow<Params> = {
  id: "implement",
  description: "Implement a bug fix or a feature: investigate the code, get the plan approved, write the change as commits on a new branch in this checkout, review it, and revise until the user accepts. Use it for requests like \"fix bug …\", \"implement …\", \"add …\" and \"resume …\".",
  argHint: "<what to fix or build>",
  params,
  next: implementNext,
  checkAnswer: implementCheckAnswer,
  parseArgs: (args) => args.trim() ? { ok: true, params: { request: args.trim(), profile: null, checkout: null } } : { ok: false, error: "Usage: /implement <what to fix or build>" },
  async precheck(repo, p, rt) {
    const busy = busyCheckout(rt, repo);
    if (busy) throw new Error(`${busy.message}; finish or abandon it first`);
    if (p.checkout !== null) return null;
    const writer = makeGitWriter(repo);
    const [branch, changed] = await Promise.all([writer.currentBranch(), writer.changedFiles()]);
    if (changed === 0 && isMainline(branch)) return null;
    const fork = branch && !isMainline(branch) ? await nearestFork(makeGit(repo)) : null;
    const ahead = fork ? (await makeGit(repo).log(fork, "HEAD")).length : 0;
    const where = branch ? `on branch \`${branch}\`` : "on a detached HEAD";
    const question = changed
      ? `The checkout has uncommitted changes in ${plural(changed, "file")} (${where}).`
      : `The checkout is ${where}, not on main.`;
    // `git switch -c` carries uncommitted changes over; the old branch's commits stay behind.
    return { question, options: [
      ...(branch && ahead > 0 ? [{ label: `Adopt the work on ${branch} (its commits and review rounds)${changed ? " with the uncommitted changes" : ""}`, params: { checkout: "adopt-branch" as const } }] : []),
      ...(branch ? [{ label: changed ? `Continue on ${branch} with the uncommitted changes` : `Continue on ${branch}`, params: { checkout: "current-branch" as const } }] : []),
      { label: changed ? "New branch from the default branch, carrying the uncommitted changes over" : "Start fresh on a new branch from the default branch", params: { checkout: "new-branch" as const } },
      { label: "Cancel" },
    ] };
  },
  async start(rt, sessionId, { params: p, startId }) {
    const worktree = rt.store.getSession(sessionId).worktree;
    const busy = busyCheckout(rt, worktree, sessionId);
    if (busy) {
      rt.emit(sessionId, "runtime", "notify", { id: "implement-busy", title: "Checkout in use", body: busy.message, action: { label: "Abandon that session", path: `/api/sessions/${busy.session.id}/abandon` } });
      throw new Error(busy.message);
    }
    const writeMode = rt.store.getArtifact<WorkflowStartData>(startId).data.writeMode;
    const checkout = p.checkout ?? "new-branch";
    await rt.run(sessionId, "implementStart", { request: p.request, checkout: checkout === "adopt-branch" ? "current-branch" : checkout, ...(writeMode ? { writeMode } : {}) });
    if (checkout === "adopt-branch") await rt.runPhase(sessionId, "adopt", { mode: "moved" } satisfies AdoptInput);
  },
};
