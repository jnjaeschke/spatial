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
  let base: Promise<string> | undefined;
  const run = async (args: string[], signal: AbortSignal) => {
    const { stdout, stderr, code } = await runProcess(bin, args, { stdin: "", signal });
    if (code !== 0) throw new Error(`searchfox-cli failed: ${(stderr || stdout).trim().slice(-1000)}`);
    return stdout;
  };
  return {
    effect: "read-only",
    async specRefs(url, signal) {
      return parseSpecRefs(await run(["--spec-refs", url, "-l", "30"], signal));
    },
    sourceBase() {
      base ??= run(["--get-file", "moz.build", "--lines", "1", "--link"], new AbortController().signal).then((out) => {
        const m = /^(https:\/\/\S+\/source\/)moz\.build#1$/.exec(out.trim());
        if (!m) throw new Error(`Unexpected searchfox-cli link output: ${out.trim().slice(0, 200)}`);
        return m[1];
      });
      base.catch(() => { base = undefined; });
      return base;
    },
  };
}
