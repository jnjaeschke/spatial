import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CodeScope, GeckoSpecRef } from "../shared/types.ts";
import { runChecked } from "./process.ts";
import type { SearchfoxCapability } from "./tasks.ts";
import type { CodeSearch } from "./code-search.ts";

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

export function makeSearchfox(opts: { bin?: string; tipTtlMs?: number; now?: () => number } = {}): SearchfoxCapability {
  const bin = opts.bin ?? "searchfox-cli";
  const tipTtlMs = opts.tipTtlMs ?? 60 * 60 * 1000;
  const now = opts.now ?? Date.now;
  let tipResult: Promise<{ repoBase: string; rev: string }> | undefined;
  let tipAt = 0;
  const run = async (args: string[], signal: AbortSignal) => {
    return (await runChecked(bin, args, { stdin: "", signal, label: "searchfox-cli" })).stdout;
  };
  return {
    effect: "read-only",
    async define(symbol, signal) {
      const [permalinks, source] = await Promise.all([
        run(["--define", symbol, "--permalink"], signal),
        run(["--define", symbol], signal),
      ]);
      const permalink = /^https:\/\/\S+\/rev\/[0-9a-f]{40}\/(\S+?)#(\d+)/m.exec(permalinks);
      const definition = /^>>> (\d+): (.*)$/m.exec(source);
      if (!permalink || !definition || Number(definition[1]) !== Number(permalink[2])) return null;
      return { path: permalink[1], line: Number(permalink[2]), text: definition[2] };
    },
    async specRefs(url, signal, limit = 30) {
      return parseSpecRefs(await run(["--spec-refs", url, "-l", String(limit)], signal));
    },
    async functionAt(path, line, signal) {
      return parseFunctionAt(await run(["--function-at", `${path}:${line}`], signal));
    },
    file: (path, signal) => run(["--get-file", path], signal),
    tip() {
      if (tipResult && now() - tipAt >= tipTtlMs) tipResult = undefined;
      if (!tipResult) {
        tipAt = now();
        const result = run(["--get-file", "moz.build", "--lines", "1", "--permalink"], new AbortController().signal).then((out) => {
          const m = /^(https:\/\/\S+\/)rev\/([0-9a-f]{40})\/moz\.build#1$/.exec(out.trim());
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

/** `CodeSearch` over a searchfox repository (searchfox indexes Gecko and WebKit); a missing file (`404 Not Found`) reads as null. */
export function searchfoxCodeSearch(engine: "gecko" | "webkit", searchfox: SearchfoxCapability): CodeSearch {
  return {
    effect: "read-only", engine,
    specRefs: (url, signal, limit) => searchfox.specRefs(url, signal, limit),
    functionAt: (path, line, signal) => searchfox.functionAt(path, line, signal),
    async file(path, signal) {
      try { return await searchfox.file(path, signal); }
      catch (error) { if (/404 Not Found/.test((error as Error).message)) return null; throw error; }
    },
    tip: () => searchfox.tip(),
  };
}
