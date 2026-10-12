import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CodeScope, GeckoSpecRef } from "../shared/types.ts";
import { runChecked } from "./process.ts";
import type { SearchfoxCapability } from "./tasks.ts";
import type { CodeSearch } from "./code-search.ts";
import { escapeRegex } from "./code-search.ts";

/** A searchfox repository the runtime searches: Gecko's or WebKit's. */
export type SearchfoxRepo = "mozilla-central" | "wubkat";

// A file at the top of each tree, read once for the tip permalink.
const TIP_FILE: Record<SearchfoxRepo, string> = { "mozilla-central": "moz.build", wubkat: "CMakeLists.txt" };

export function isGeckoRepo(repo: string): boolean {
  return existsSync(join(repo, "mach")) && existsSync(join(repo, "moz.build"));
}

export function parseSpecRefs(markdown: string): GeckoSpecRef[] {
  const out: GeckoSpecRef[] = [];
  let group = "";
  for (const line of markdown.split("\n")) {
    const g = /^### (.+)$/.exec(line);
    if (g) { group = g[1].trim(); continue; }
    const m = /^- (.+):(\d+) — (\S+)$/.exec(line);
    if (m) out.push({ group, path: m[1], line: Number(m[2]), url: m[3] });
  }
  return out;
}

/** The scopes of `searchfox-cli --function-at` output, innermost first. */
export function parseFunctionAt(output: string): CodeScope[] {
  const lines = output.split("\n");
  return lines.flatMap((line, index) => {
    const scope = /^\s*in (\S+)$/.exec(line);
    return scope ? [{ symbol: scope[1]!, signature: (lines[index + 1] ?? "").trim() }] : [];
  });
}

export function makeSearchfox(opts: { bin?: string; repo?: SearchfoxRepo; tipTtlMs?: number; now?: () => number } = {}): SearchfoxCapability {
  const bin = opts.bin ?? "searchfox-cli";
  const repo = opts.repo ?? "mozilla-central";
  const repoArgs = repo === "mozilla-central" ? [] : ["-R", repo];
  const tipTtlMs = opts.tipTtlMs ?? 60 * 60 * 1000;
  const now = opts.now ?? Date.now;
  let tipResult: Promise<{ repoBase: string; rev: string }> | undefined;
  let tipAt = 0;
  /** A value for a searchfox-cli flag; its parser would take a leading `-` for another flag. */
  const value = (text: string) => { if (text.startsWith("-")) throw new Error(`searchfox-cli argument must not start with "-": ${text}`); return text; };
  const run = async (args: string[], signal: AbortSignal) => {
    return (await runChecked(bin, [...repoArgs, ...args], { stdin: "", signal, label: "searchfox-cli" })).stdout;
  };
  return {
    effect: "read-only",
    async define(symbol, signal) {
      const [permalinks, source] = await Promise.all([
        run(["--define", value(symbol), "--permalink"], signal),
        run(["--define", value(symbol)], signal),
      ]);
      const permalink = /^https:\/\/\S+\/rev\/[0-9a-f]{40}\/(\S+?)#(\d+)/m.exec(permalinks);
      const definition = /^>>> (\d+): (.*)$/m.exec(source);
      if (!permalink || !definition || Number(definition[1]) !== Number(permalink[2])) return null;
      return { path: permalink[1], line: Number(permalink[2]), text: definition[2] };
    },
    async specRefs(url, signal, limit = 30) {
      return parseSpecRefs(await run(["--spec-refs", value(url), "-l", String(limit)], signal));
    },
    async functionAt(path, line, signal) {
      if (!Number.isInteger(line) || line < 1) throw new Error(`searchfox-cli line must be a positive integer: ${line}`);
      return parseFunctionAt(await run(["--function-at", `${value(path)}:${line}`], signal));
    },
    file: async (path, signal) => run(["--get-file", value(path)], signal),
    tip() {
      if (tipResult && now() - tipAt >= tipTtlMs) tipResult = undefined;
      if (!tipResult) {
        tipAt = now();
        const result = run(["--get-file", TIP_FILE[repo], "--lines", "1", "--permalink"], new AbortController().signal).then((out) => {
          const m = new RegExp(`^(https://\\S+/)rev/([0-9a-f]{40})/${escapeRegex(TIP_FILE[repo])}#1$`).exec(out.trim());
          if (!m) throw new Error(`Unexpected searchfox-cli permalink output: ${out.trim().slice(0, 200)}`);
          return { repoBase: m[1]!, rev: m[2]! };
        });
        tipResult = result;
        result.catch(() => { if (tipResult === result) tipResult = undefined; });
      }
      return tipResult;
    },
  };
}

/** `CodeSearch` over a searchfox repository (searchfox indexes Gecko and WebKit), which pins every revision and indexes functions; a missing file (`404 Not Found`) reads as null. */
export function searchfoxCodeSearch(engine: "gecko" | "webkit", searchfox: SearchfoxCapability): CodeSearch {
  return {
    effect: "read-only", engine, pinned: true, heuristicScopes: false,
    specRefs: (url, signal, limit) => searchfox.specRefs(url, signal, limit),
    functionAt: (path, line, signal) => searchfox.functionAt(path, line, signal),
    async file(path, signal) {
      try { return await searchfox.file(path, signal); }
      catch (error) { if (/404 Not Found/.test((error as Error).message)) return null; throw error; }
    },
    tip: () => searchfox.tip(),
  };
}
