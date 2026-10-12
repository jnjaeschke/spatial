import { enclosingFunction } from "../../src/runtime/brace-scan.ts";
import type { CodeSearch } from "../../src/runtime/code-search.ts";
import type { Engine, GeckoSpecRef } from "../../src/shared/types.ts";

/** An in-memory `CodeSearch` over `files` (path → text) returning `refs`; functions by brace scan; Blink is unpinned and heuristic. `calls` logs every call. */
export function fakeCode(files: Record<string, string>, refs: GeckoSpecRef[], opts: { engine?: Engine; rev?: () => string; repoBase?: string } = {}) {
  const engine = opts.engine ?? "blink";
  const calls: string[] = [];
  const code: CodeSearch = {
    effect: "read-only", engine, pinned: engine !== "blink", heuristicScopes: engine === "blink",
    async specRefs(url) { calls.push(`specRefs ${url}`); return refs; },
    async functionAt(path, line) { calls.push(`functionAt ${path}:${line}`); const found = files[path] === undefined ? null : enclosingFunction(files[path]!.split("\n"), line); return found ? [{ symbol: found.symbol, signature: found.signature }] : []; },
    async file(path) { calls.push(`file ${path}`); return files[path] ?? null; },
    async tip() { calls.push("tip"); return { repoBase: opts.repoBase ?? `https://code.example/${engine}/`, rev: opts.rev?.() ?? (engine === "blink" ? "main" : "r1") }; },
  };
  return { code, calls };
}
