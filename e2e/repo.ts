import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function git(dir: string, ...args: string[]): string {
  return execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trimEnd();
}

export function makeRepo(prefix: string, files: Record<string, string>, commitMessage = "base"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  git(dir, "init", "-b", "main");
  for (const [path, content] of Object.entries(files)) writeFileSync(join(dir, path), content);
  git(dir, "add", "-A");
  git(dir, "commit", "-m", commitMessage);
  return dir;
}

export function writeLines(dir: string, values: string[]): void {
  writeFileSync(join(dir, "a.txt"), `${values.join("\n")}\n`);
}

export function inlineTx(id: number, path: string, line: number, body: string, options: { diffId?: number; revision?: number; isNewFile?: boolean; isDone?: boolean; phid?: string; author?: string; replyTo?: string } = {}) {
  const revision = options.revision ?? 1;
  const diffId = options.diffId ?? revision * 10 + 1;
  const author = options.author ?? "alice";
  return { id, phid: `PHID-XACT-${id}`, type: "inline", authorPHID: `PHID-USER-${author}`, objectPHID: `PHID-DREV-${revision}`, dateCreated: id, dateModified: id, groupID: null, comments: [{ id: id + 100, phid: options.phid ?? `PHID-XCMT-${id}`, version: 1, authorPHID: `PHID-USER-${author}`, dateCreated: id - 1, dateModified: id, removed: false, content: { raw: body } }], fields: { diff: { id: diffId, phid: `PHID-DIFF-${diffId}` }, path, line, length: 1, isNewFile: options.isNewFile ?? true, replyToCommentPHID: options.replyTo ?? null, isDone: options.isDone ?? false, hasSuggestion: false, suggestionText: null } };
}
