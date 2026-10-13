import type { Commit, GitCapability, LocalBranch } from "../../../plugin-api.ts";
import type { LlmSelection } from "../../../plugin-api.ts";
import { commitRevision, groupRounds, roundStack, type RoundEntry, type RoundPhaseInput } from "../../review/api.ts";
import type { AdoptPlanData, AdoptRangeInput } from "../shared/types.ts";

const MAINLINE = new Set(["main", "master"]);

/** The investigate request for adopted work: the user's request plus the commits that already implement it. */
export function adoptedRequest(request: string, branch: string, base: string, commits: Commit[]): string {
  const lines = commits.map((c) => { const rev = commitRevision(c); return `- ${c.subject} (${c.sha.slice(0, 12)})${rev ? ` D${rev.id}` : ""}`; });
  return `${request}\n\n# Existing work\n\nBranch ${branch} already holds this work, made outside spatial and submitted for review: ${commits.length} commits since ${base.slice(0, 12)}.\n${lines.join("\n")}\n\nInvestigate this as the implementation that exists: plan one step per commit as these commits take them, with the acceptance checks that verify them. Later rounds change these commits in response to review comments.`;
}

/** The newest merge-base of `tip` with any of `refs` (unresolvable refs are skipped): a stale remote ref then cannot widen the range. */
export async function adoptBase(git: GitCapability, refs: string[], tip: string): Promise<string | null> {
  let best: string | null = null;
  for (const ref of refs) {
    let base: string | null;
    try { base = await git.mergeBase(await git.resolve(ref), tip); } catch { continue; }
    if (base && (best === null || await git.isAncestor(best, base))) best = base;
  }
  return best;
}

/** Local branches holding the session's work: a commit subject names `bug` as a whole word, or a commit's patch id is one the session already knows. At most 50 commits per branch are inspected. */
export async function relatedBranches(git: GitCapability, branches: LocalBranch[], opts: { refs: string[]; bug: number | null; knownPatchIds: Set<string> }): Promise<string[]> {
  const bug = opts.bug === null ? null : new RegExp(`\\b${opts.bug}\\b`);
  const found: string[] = [];
  for (const branch of branches) {
    if (MAINLINE.has(branch.name)) continue;
    const base = await adoptBase(git, opts.refs, branch.sha);
    if (!base) continue;
    const commits = (await git.log(base, branch.sha)).slice(-50);
    if (bug && commits.some((commit) => bug.test(commit.subject))) { found.push(branch.name); continue; }
    if (opts.knownPatchIds.size && (await git.patchIds(base, branch.sha)).slice(-50).some((item) => opts.knownPatchIds.has(item.patchId))) found.push(branch.name);
  }
  return found;
}

/** The branches offered when the user chooses: the checked-out one, then the newest. */
export const recentBranches = (branches: LocalBranch[]): string[] => branches.slice(0, 8).map((branch) => branch.name);

/** The round epochs of an adopted range: rebuilt Phabricator rounds, then the local commits matched to the newest diffs. */
export function adoptRounds(plan: AdoptPlanData, range: AdoptRangeInput, llm?: LlmSelection): RoundPhaseInput[] {
  const branch = plan.branches.find((b) => b.branch === range.branch);
  if (!branch) throw new Error(`Branch ${range.branch} is not in the adopt plan`);
  const commits = branch.commits.slice(0, branch.commits.findIndex((c) => c.sha === range.head) + 1);
  const order = [...new Set(commits.map(commitRevision).filter((r) => r !== null && r.host === plan.host).map((r) => r!.id))];
  const extra = llm ? { llm } : {};
  if (!plan.host || !plan.diffs.some((d) => order.includes(d.revision))) return [{ round: { kind: "local", base: branch.base, head: range.head, host: null, phab: null }, narrate: true, ...extra }];
  const meta = new Map(plan.revisions.map((r) => [r.id, r]));
  const entry = (d: (typeof plan.diffs)[number]): RoundEntry => ({ ...d, title: meta.get(d.revision)!.title, latestDiffId: meta.get(d.revision)!.latestDiffId });
  const rounds = groupRounds(plan.diffs.filter((d) => order.includes(d.revision)));
  const stacks = rounds.map((_, k) => roundStack(rounds, k, order));
  const history = stacks.slice(0, -1).filter((stack) => !plan.missingBases.includes(stack[0]!.base))
    .map((stack): RoundPhaseInput => ({ round: { kind: "phabricator", host: plan.host!, stack: stack.map(entry) }, narrate: false }));
  return [...history, { round: { kind: "local", base: branch.base, head: range.head, host: plan.host, phab: stacks.at(-1)!.map(entry) }, narrate: true, ...extra }];
}
