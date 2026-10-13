import { existsSync } from "node:fs";
import { join } from "node:path";
import { localMainline, parseUnifiedDiff, remoteDefaultRef, resolveRepo, runGit as run, safeRepoPath, safeRevision, type CommitDetail, type CommitFileStat, type DiffFile, type FileStatus, type LogRow, type LogScope, type RefRow } from "../../../plugin-api.ts";

const GIT_TIMEOUT_MS = 60_000;
const runGit = (repo: string, args: string[]) => run(repo, args, { timeout: GIT_TIMEOUT_MS });

const LOG_FORMAT = "--format=%H%x00%P%x00%an%x00%ae%x00%aI%x00%s%x1e";

function logRows(out: string): LogRow[] {
  return out.split("\x1e").map((record) => record.replace(/^\n/, "")).filter(Boolean).map((record) => {
    const [sha, parents, author, email, date, subject] = record.split("\0");
    return { sha: sha!, parents: parents ? parents.split(" ") : [], author: author!, email: email!, date: date!, subject: subject! };
  });
}

/** The branch work is compared against: the remote default branch, else local `main`, else `master`; null without one. */
async function defaultBranch(repo: string): Promise<string | null> {
  return (await remoteDefaultRef(repo)) ?? (await localMainline(repo))?.ref ?? null;
}

/** Where the current branch left the default branch; null on the default branch itself, behind it, or without one. */
async function currentBase(repo: string): Promise<string | null> {
  const base = await defaultBranch(repo);
  if (!base) return null;
  let mergeBase: string;
  try { mergeBase = (await runGit(repo, ["merge-base", "HEAD", base])).trim(); }
  catch { return null; }
  const head = (await runGit(repo, ["rev-parse", "HEAD"])).trim();
  return mergeBase === head ? null : mergeBase;
}

/** One page of the topo-ordered log of `scope`, newest first; at most 500 rows. */
export async function logPage(repo: string, scope: LogScope, skip: number, limit: number): Promise<LogRow[]> {
  if (!Number.isInteger(skip) || skip < 0) throw new Error(`Invalid skip: ${skip}`);
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`Invalid limit: ${limit}`);
  const args = ["log", "--topo-order", LOG_FORMAT, `--skip=${skip}`, `-n${Math.min(limit, 500)}`];
  if (scope.kind === "all") args.push("--all");
  else if (scope.kind === "range") args.push("--end-of-options", safeRevision(scope.range, "range"));
  else {
    const base = scope.kind === "current" ? await currentBase(repo) : null;
    if (base) args.push(`${base}..HEAD`);
    else {
      args.push("--branches");
      const remote = await remoteDefaultRef(repo);
      if (remote) args.push(remote);
    }
  }
  return logRows(await runGit(repo, args));
}

/** Local branches, remote branches (without `<remote>/HEAD`), tags peeled to their commit, and this work tree's HEAD, each with its commit's committer date. */
export async function refs(repo: string): Promise<RefRow[]> {
  const [out, worktrees] = await Promise.all([
    runGit(repo, ["for-each-ref", "--format=%(refname)%00%(objectname)%00%(*objectname)%00%(upstream:short)%00%(committerdate:iso-strict)%00%(*committerdate:iso-strict)", "refs/heads", "refs/remotes", "refs/tags"]),
    runGit(repo, ["worktree", "list", "--porcelain"]),
  ]);
  const checkedOut = new Map<string, string>();
  for (const block of worktrees.split("\n\n")) {
    const path = /^worktree (.*)$/m.exec(block)?.[1];
    const branch = /^branch refs\/heads\/(.*)$/m.exec(block)?.[1];
    if (path && branch) checkedOut.set(branch, path);
  }
  const rows: RefRow[] = [];
  for (const line of out.split("\n").filter(Boolean)) {
    const [refname, object, peeled, upstream, ownDate, peeledDate] = line.split("\0") as [string, string, string, string, string, string];
    const sha = peeled || object;
    const date = peeledDate || ownDate;
    if (refname.startsWith("refs/heads/")) {
      const name = refname.slice("refs/heads/".length);
      const worktree = checkedOut.get(name);
      rows.push({ name, kind: "head", sha, date, ...(upstream ? { upstream } : {}), ...(worktree ? { worktree } : {}) });
    } else if (refname.startsWith("refs/remotes/")) {
      if (!refname.endsWith("/HEAD")) rows.push({ name: refname.slice("refs/remotes/".length), kind: "remote", sha, date });
    } else rows.push({ name: refname.slice("refs/tags/".length), kind: "tag", sha, date });
  }
  try {
    const [sha, date] = (await runGit(repo, ["show", "--no-patch", "--format=%H%x00%cI", "HEAD"])).trim().split("\0") as [string, string];
    rows.push({ name: "HEAD", kind: "HEAD", sha, date });
  }
  catch { /* An empty repository has no HEAD commit. */ }
  return rows;
}

/** Whether the repository has a commit-graph file; without one `--topo-order` walks the whole history before the first row. */
export async function hasCommitGraph(repo: string): Promise<boolean> {
  const { repoDir } = await resolveRepo(repo);
  return existsSync(join(repoDir, "objects", "info", "commit-graph")) || existsSync(join(repoDir, "objects", "info", "commit-graphs"));
}

/** The empty tree in this repository's hash format; computed, never written. */
async function emptyTree(repo: string): Promise<string> {
  return (await runGit(repo, ["hash-object", "-t", "tree", "/dev/null"])).trim();
}

const STATUS: Record<string, FileStatus> = { A: "added", D: "deleted", R: "renamed" };

function fileStats(nameStatus: string, numstat: string): CommitFileStat[] {
  const counts = new Map<string, { added: number; deleted: number; binary: boolean }>();
  const numbers = numstat.split("\0");
  for (let index = 0; index < numbers.length - 1;) {
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(numbers[index++]!);
    if (!match) throw new Error(`Unparseable numstat record: ${numbers[index - 1]}`);
    let path = match[3]!;
    // A rename has an empty path field followed by the old and the new path.
    if (path === "") { index++; path = numbers[index++]!; }
    const binary = match[1] === "-";
    counts.set(path, { added: binary ? 0 : Number(match[1]), deleted: binary ? 0 : Number(match[2]), binary });
  }
  const files: CommitFileStat[] = [];
  const names = nameStatus.split("\0");
  for (let index = 0; index < names.length - 1;) {
    const code = names[index++]!;
    const status = STATUS[code[0]!] ?? "modified";
    const oldPath = status === "renamed" ? names[index++]! : undefined;
    const path = names[index++]!;
    files.push({ path, ...(oldPath !== undefined ? { oldPath } : {}), status, ...counts.get(path)! });
  }
  return files;
}

/** A commit's message, identities and changed files, against its first parent (the empty tree for a root commit). */
export async function commitDetail(repo: string, rev: string): Promise<CommitDetail> {
  safeRevision(rev, "revision");
  const out = await runGit(repo, ["show", "--no-patch", "--format=%H%x00%P%x00%an%x00%ae%x00%aI%x00%cn%x00%cI%x00%s%x00%b", "--end-of-options", rev]);
  const [sha, parentList, author, email, date, committer, committerDate, subject, body] = out.split("\0") as string[];
  const parents = parentList ? parentList.split(" ") : [];
  return { sha: sha!, parents, author: author!, email: email!, date: date!, committer: committer!, committerDate: committerDate!, subject: subject!, body: body!.trim(), files: await changedFiles(repo, parents[0] ?? null, sha!) };
}

/** The files changed from `a` (null: the empty tree) to `b`, with line counts. */
export async function changedFiles(repo: string, a: string | null, b: string): Promise<CommitFileStat[]> {
  safeRevision(b, "revision");
  const from = a === null ? await emptyTree(repo) : safeRevision(a, "revision");
  const [nameStatus, numstat] = await Promise.all([
    runGit(repo, ["diff-tree", "-r", "-M", "-z", "--no-commit-id", "--name-status", "--end-of-options", from, b]),
    runGit(repo, ["diff-tree", "-r", "-M", "-z", "--no-commit-id", "--numstat", "--end-of-options", from, b]),
  ]);
  return fileStats(nameStatus, numstat);
}

/** The parsed diff from `a` (null: the empty tree) to `b`, optionally limited to `paths` (give both paths of a rename so git still pairs them). */
export async function diffFiles(repo: string, a: string | null, b: string, paths?: string[]): Promise<DiffFile[]> {
  safeRevision(b, "revision");
  const from = a === null ? await emptyTree(repo) : safeRevision(a, "revision");
  const args = ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "-M", "-U3", "--end-of-options", from, b];
  if (paths?.length) args.push("--", ...paths.map(safeRepoPath));
  return parseUnifiedDiff(await runGit(repo, args));
}
