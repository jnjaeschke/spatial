import type { GitCapability, LocalBranch } from "../../../plugin-api.ts";

const MAINLINE = new Set(["main", "master"]);

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
