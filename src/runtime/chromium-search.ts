import { enclosingFunction } from "./brace-scan.ts";
import { escapeRegex, specUrlParts, type CodeSearch } from "./code-search.ts";
import { runChecked, runProcess } from "./process.ts";

const REPO_BASE = "https://source.chromium.org/chromium/chromium/src/";
const TEST_PATH = /(^|\/)(web_tests|LayoutTests)\//;

/** The lines of a `cat -n` output. */
export function parseNumbered(out: string): string[] {
  const lines: string[] = [];
  for (const row of out.split("\n")) { const match = /^\s*(\d+)\t(.*)$/.exec(row); if (match) lines[Number(match[1]) - 1] = match[2]!; }
  return Array.from(lines, (line) => line ?? "");
}

/** `CodeSearch` over Chromium (`chromium-search`) at `main`: spec links by a one-line regex search, functions by brace scan. */
export function makeChromiumSearch(opts: { bin?: string } = {}): CodeSearch {
  const bin = opts.bin ?? "chromium-search";
  const file = async (path: string, signal: AbortSignal) => {
    if (path.startsWith("-")) throw new Error(`chromium-search argument must not start with "-": ${path}`);
    const { stdout, stderr, code } = await runProcess(bin, ["cat", path, "-n"], { stdin: "", signal });
    if (code === 0) return parseNumbered(stdout).join("\n");
    if (/File not found/.test(stderr)) return null;
    throw new Error(`chromium-search exited with code ${code}: ${(stderr || stdout).trim().slice(-1000)}`);
  };
  return {
    effect: "read-only", engine: "blink", pinned: false, heuristicScopes: true,
    async specRefs(url, signal, limit = 30) {
      const { prefix, anchor } = specUrlParts(url);
      // Plain terms match per file, `pcre:yes` per line; generated files under out/ repeat the sources.
      const { stdout } = await runChecked(bin, ["search", `pcre:yes ${escapeRegex(prefix)}\\S*#${escapeRegex(anchor)} -file:^out/`, "--json", "path,line,snippet", "-L", String(limit)], { stdin: "", signal, label: "chromium-search" });
      return (JSON.parse(stdout) as { path: string; line: number }[]).map(({ path, line }) => ({ group: TEST_PATH.test(path) ? "Test" : "Code", path, line, url: `${REPO_BASE}+/main:${path};l=${line}` }));
    },
    async functionAt(path, line, signal) {
      if (!Number.isInteger(line) || line < 1) throw new Error(`chromium-search line must be a positive integer: ${line}`);
      const text = await file(path, signal);
      const found = text === null ? null : enclosingFunction(text.split("\n"), line);
      return found ? [{ symbol: found.symbol, signature: found.signature }] : [];
    },
    file,
    async tip() { return { repoBase: REPO_BASE, rev: "main" }; },
  };
}
