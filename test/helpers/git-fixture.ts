import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function makeRepo(): { dir: string; git(...args: string[]): string; commit(files: Record<string, string | null>, message: string): string } {
  const dir = mkdtempSync(join(tmpdir(), "repo-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  return {
    dir,
    git,
    commit(files, message) {
      for (const [path, content] of Object.entries(files)) {
        const abs = join(dir, path);
        if (content === null) rmSync(abs);
        else {
          mkdirSync(dirname(abs), { recursive: true });
          writeFileSync(abs, content);
        }
      }
      git("add", "-A");
      git("commit", "-q", "-m", message);
      return git("rev-parse", "HEAD");
    },
  };
}
