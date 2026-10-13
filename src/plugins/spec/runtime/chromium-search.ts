import { enclosingFunction } from "./brace-scan.ts";
import { escapeRegex, runChecked } from "../../../plugin-api.ts";
import { specUrlParts, type CodeSearch } from "./code-search.ts";

const REPO_BASE = "https://source.chromium.org/chromium/chromium/src/";
const TEST_PATH = /(^|\/)(web_tests|LayoutTests)\//;
const FILE_TTL_MS = 10 * 60 * 1000;

/** The lines of a `cat -n` output. */
export function parseNumbered(out: string): string[] {
  const lines: string[] = [];
  for (const row of out.split("\n")) { const match = /^\s*(\d+)\t(.*)$/.exec(row); if (match) lines[Number(match[1]) - 1] = match[2]!; }
  return Array.from(lines, (line) => line ?? "");
}

/**
 * `CodeSearch` over Chromium (`chromium-search`) at `main`: spec links by a one-line regex search, functions by brace scan. Files are kept
 * for a few minutes, so the references and scopes of one mapping run read the same revision of a file.
 */
export function makeChromiumSearch(opts: { bin?: string } = {}): CodeSearch {
  const bin = opts.bin ?? "chromium-search";
  const run = async (args: string[], signal: AbortSignal) => (await runChecked(bin, args, { stdin: "", signal, label: "chromium-search" })).stdout;
  const files = new Map<string, { at: number; text: string | null }>();
  const fetchFile = async (path: string, signal: AbortSignal) => {
    try { return parseNumbered(await run(["cat", path, "-n"], signal)).join("\n"); }
    catch (error) {
      if (!/File not found/.test((error as Error).message)) throw error;
      // `cat` reports every failed fetch (timeout, quota) as "File not found"; only a path the file finder does not list is missing.
      if ((await run(["find", path], signal)).split("\n").includes(path)) throw error;
      return null;
    }
  };
  const file = async (path: string, signal: AbortSignal) => {
    if (path.startsWith("-")) throw new Error(`chromium-search argument must not start with "-": ${path}`);
    const kept = files.get(path);
    if (kept && Date.now() - kept.at < FILE_TTL_MS) return kept.text;
    const text = await fetchFile(path, signal);
    for (const [kept, { at }] of files) if (Date.now() - at >= FILE_TTL_MS) files.delete(kept);
    files.set(path, { at: Date.now(), text });
    return text;
  };
  return {
    effect: "read-only", engine: "blink", pinned: false, heuristicScopes: true,
    async specRefs(url, signal, limit = 30) {
      const { prefix, anchor } = specUrlParts(url);
      // Plain terms match per file, `pcre:yes` per line; generated files under out/ repeat the sources.
      const stdout = await run(["search", `pcre:yes ${escapeRegex(prefix)}\\S*#${escapeRegex(anchor)} -file:^out/`, "--json", "path,line,snippet", "-L", String(limit)], signal);
      return (JSON.parse(stdout) as { path: string; line: number }[]).map(({ path, line }) => ({ group: TEST_PATH.test(path) ? "Test" : "Code", path, line, url: `${REPO_BASE}+/main:${path};l=${line}` }));
    },
    async search(query, signal, limit = 30) {
      // Code search splits terms at whitespace and negates a term that starts with "-"; one escaped term keeps the text literal.
      const literal = escapeRegex(query.trim()).replace(/\s+/g, "\\s+").replace(/^-/, "\\-");
      const stdout = await run(["search", `pcre:yes ${literal} -file:^out/`, "--json", "path,line,snippet", "-L", String(limit)], signal);
      return (JSON.parse(stdout) as { path: string; line: number; snippet: string }[]).map(({ path, line, snippet }) => ({ path, line, snippet }));
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
