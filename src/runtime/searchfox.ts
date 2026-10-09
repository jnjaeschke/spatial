import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GeckoSpecRef } from "../shared/types.ts";
import { runProcess } from "./process.ts";
import type { SearchfoxCapability } from "./tasks.ts";

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

export function makeSearchfox(opts: { bin?: string } = {}): SearchfoxCapability {
  const bin = opts.bin ?? "searchfox-cli";
  let tipResult: Promise<{ repoBase: string; rev: string }> | undefined;
  const run = async (args: string[], signal: AbortSignal) => {
    const { stdout, stderr, code } = await runProcess(bin, args, { stdin: "", signal });
    if (code !== 0) throw new Error(`searchfox-cli failed: ${(stderr || stdout).trim().slice(-1000)}`);
    return stdout;
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
    async specRefs(url, signal) {
      return parseSpecRefs(await run(["--spec-refs", url, "-l", "30"], signal));
    },
    tip() {
      tipResult ??= run(["--get-file", "moz.build", "--lines", "1", "--permalink"], new AbortController().signal).then((out) => {
        const m = /^(https:\/\/\S+\/)rev\/([0-9a-f]{40})\/moz\.build#1$/.exec(out.trim());
        if (!m) throw new Error(`Unexpected searchfox-cli permalink output: ${out.trim().slice(0, 200)}`);
        return { repoBase: m[1], rev: m[2] };
      });
      tipResult.catch(() => { tipResult = undefined; });
      return tipResult;
    },
  };
}
