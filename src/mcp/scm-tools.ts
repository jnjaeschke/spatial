import { parseBlameLines } from "../runtime/blame.ts";
import { fileLines, mergeBase, statusLines } from "../runtime/git/read.ts";
import { runGit, safeRepoPath, safeRevision } from "../runtime/git/run.ts";
import { capOutput } from "../runtime/process.ts";

/** Most a session MCP tool answers with, so one answer cannot flood the LLM's context. */
export const MAX_TOOL_OUTPUT = 64 * 1024;

const capScmOutput = (output: string) => capOutput(output, MAX_TOOL_OUTPUT);

/** Keeps whole lines within the SCM output cap; returns how many lines fit. */
function capWholeLines(lines: string[]): { text: string; kept: number } {
  let length = 0;
  for (let index = 0; index < lines.length; index++) {
    length += lines[index]!.length + 1;
    if (length > MAX_TOOL_OUTPUT - 100) return { text: lines.slice(0, index).join("\n"), kept: index };
  }
  return { text: lines.join("\n"), kept: lines.length };
}

/** Read-only SCM summaries for an agent working in this repository. */
export async function scmStatus(repo: string): Promise<string> {
  let branch: string;
  try { branch = (await runGit(repo, ["symbolic-ref", "--quiet", "--short", "HEAD"])).trim(); }
  catch { branch = (await runGit(repo, ["rev-parse", "--short", "HEAD"])).trim() + " (detached HEAD)"; }
  let upstream = "";
  try { upstream = (await runGit(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])).trim(); }
  catch { /* An upstream is optional. */ }
  const lines = (await statusLines(repo)).slice(0, 200);
  return capScmOutput([`Branch: ${branch}`, ...(upstream ? [`Upstream: ${upstream}`] : []), lines.length ? "Changes:" : "Working tree clean.", ...lines].join("\n"));
}

export async function scmBranches(repo: string): Promise<string> {
  const out = await runGit(repo, ["for-each-ref", "--format=%(refname:short)%00%(objectname:short)%00%(upstream:short)%00%(subject)", "refs/heads"]);
  const rows = out.trimEnd().split("\n").filter(Boolean).slice(0, 200);
  return capScmOutput(rows.length ? rows.map((row) => { const [name, sha, upstream, subject] = row.split("\0"); return `${name} ${sha}${upstream ? ` [${upstream}]` : ""} ${subject}`; }).join("\n") : "No local branches.");
}

/** History searches over a large repository can take minutes; past this they fail instead of blocking the agent. */
const SCM_SEARCH_TIMEOUT_MS = 120_000;

/** `search` and `regex` select commits whose diff changes the number of occurrences of a string (`git log -S`) or touches a line matching a regex (`git log -G`). */
export async function scmLog(repo: string, range: string, opts: { limit?: number; path?: string; search?: string; regex?: string } = {}): Promise<string> {
  safeRevision(range, "range");
  const args = ["log", `-${Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 500)}`, "--abbrev=12", "--format=%h %as %an: %s"];
  // Attached to their flag, so a value starting with "-" is never read as an option.
  if (opts.search !== undefined) args.push(`-S${opts.search}`);
  if (opts.regex !== undefined) args.push(`-G${opts.regex}`);
  args.push("--end-of-options", range);
  if (opts.path !== undefined) args.push("--", safeRepoPath(opts.path));
  const out = await runGit(repo, args, opts.search !== undefined || opts.regex !== undefined ? { timeout: SCM_SEARCH_TIMEOUT_MS } : {});
  return capScmOutput(out.trimEnd() || "No commits.");
}

/** Who last changed each line of `path` at `rev`: `sha date author line: text`, at most 400 lines. */
export async function scmBlame(repo: string, rev: string, path: string, start: number, end: number): Promise<string> {
  safeRevision(rev, "revision");
  safeRepoPath(path);
  if (!Number.isInteger(start) || start < 1 || !Number.isInteger(end) || end < start) throw new Error("Invalid line range");
  const out = await runGit(repo, ["blame", "--line-porcelain", "-L", `${start},${Math.min(end, start + 399)}`, rev, "--", path], { timeout: SCM_SEARCH_TIMEOUT_MS });
  const rows = parseBlameLines(out, path).map((entry) => `${entry.sha.slice(0, 12)} ${new Date(entry.authorTime * 1000).toISOString().slice(0, 10)} ${entry.author} ${entry.line}: ${entry.text}`);
  return capWholeLines(rows).text;
}

export async function scmMergeBase(repo: string, a: string, b: string): Promise<string> {
  safeRevision(a, "revision"); safeRevision(b, "revision");
  return (await mergeBase(repo, a, b)) ?? "none";
}

export async function scmShow(repo: string, rev: string): Promise<string> {
  safeRevision(rev, "revision");
  return capScmOutput((await runGit(repo, ["show", "--no-patch", "--format=commit %H%nAuthor: %an <%ae>%nDate: %aI%n%n%B", "--stat", "--end-of-options", rev])).trimEnd());
}

export async function scmDiff(repo: string, rev: string, path?: string): Promise<string> {
  safeRevision(rev, "revision");
  const args = ["show", "--format=", "-U5", "--end-of-options", rev];
  if (path !== undefined) args.push("--", safeRepoPath(path));
  const lines = (await runGit(repo, args)).trimEnd().split("\n");
  const { text, kept } = capWholeLines(lines);
  return kept < lines.length ? `${text}\n[diff truncated at a whole line]` : text;
}

export async function scmRangeDiff(repo: string, a: string, b: string, path?: string): Promise<string> {
  safeRevision(a, "revision"); safeRevision(b, "revision");
  const args = ["diff", "--no-color", "--no-ext-diff", "-M", "-U5", "--end-of-options", a, b];
  if (path !== undefined) args.push("--", safeRepoPath(path));
  const lines = (await runGit(repo, args)).trimEnd().split("\n");
  const { text, kept } = capWholeLines(lines);
  return kept < lines.length ? `${text}\n[diff truncated at a whole line]` : text || "No differences.";
}

export async function scmFile(repo: string, rev: string, path: string, start = 1, end?: number): Promise<string> {
  const lines = await fileLines(repo, rev, path);
  if (!Number.isInteger(start) || start < 1 || start > lines.length || (end !== undefined && (!Number.isInteger(end) || end < start))) throw new Error(`Invalid line range for a file of ${lines.length} lines`);
  const stop = Math.min(end ?? lines.length, start + 399, lines.length);
  const { text, kept } = capWholeLines(lines.slice(start - 1, stop).map((line, index) => `${start + index}: ${line}`));
  const next = start + kept;
  return next <= Math.min(end ?? lines.length, lines.length) ? `${text}\n[more lines available; request from line ${next}]` : text;
}
