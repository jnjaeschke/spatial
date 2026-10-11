import type { CodeScope, CodeSearch, GeckoSpecRef } from "../../../plugin-api.ts";
import type { EngineSite, EngineTest } from "../shared/types.ts";
import { byPlace, innermostFunction, isCodePath, linksAnchor, siteKey } from "../shared/engine.ts";

/** Searchfox's default is 50; `#navigate` alone has 44 references in Gecko. */
const REF_LIMIT = 500;
const LOOKAHEAD = 5;
const NOT_CODE = /^\s*(?:$|\/\/|\/\*|\*)/;

/**
 * Tier 1: the functions whose spec-link comments link the algorithm, one site per function with the comment lines in `refs`; a comment
 * outside any function belongs to the definition directly below it, or is a declaration site of its own. Also the tests that link it.
 */
export async function specLinkSites(search: Pick<CodeSearch, "specRefs" | "functionAt" | "file">, algorithm: { url: string; anchor: string }, signal: AbortSignal): Promise<{ sites: EngineSite[]; tests: EngineTest[]; files: Map<string, string[]> }> {
  const refs = (await search.specRefs(algorithm.url, signal, REF_LIMIT)).filter((ref) => ref.group !== "Code" || isCodePath(ref.path));
  const texts = await Promise.all([...new Set(refs.map((ref) => ref.path))].map(async (path) => [path, await search.file(path, signal)] as const));
  const files = new Map(texts.flatMap(([path, text]): [string, string[]][] => text === null ? [] : [[path, text.split("\n")]]));
  const linked = refs.filter((ref) => files.has(ref.path) && linksAnchor(files.get(ref.path)![ref.line - 1] ?? "", algorithm.anchor));
  const sites = new Map<string, EngineSite>();
  for (const ref of linked.filter((r) => r.group === "Code")) {
    const lines = files.get(ref.path)!;
    const { scope, at } = await enclosing(search, ref, lines, signal);
    const line = scope ? definitionLine(lines, at, scope.signature) : at;
    const site: EngineSite = { path: ref.path, line, symbol: scope?.symbol ?? "", signature: scope?.signature ?? (lines[at - 1] ?? "").trim(), quote: (lines[line - 1] ?? "").trim(), method: "spec-link", refs: [], steps: [] };
    const key = siteKey(site);
    if (!sites.has(key)) sites.set(key, site);
    sites.get(key)!.refs.push(ref.line);
  }
  return { sites: [...sites.values()].sort(byPlace), tests: linked.filter((r) => r.group !== "Code").map(({ group, path, line }) => ({ group, path, line })), files };
}

/** The function a reference is in; for a reference outside functions, the scope of the first code line within the next 5 lines (`at`), or none (`at` the reference). */
async function enclosing(search: Pick<CodeSearch, "functionAt">, ref: GeckoSpecRef, lines: string[], signal: AbortSignal): Promise<{ scope: CodeScope | null; at: number }> {
  const own = innermostFunction(await search.functionAt(ref.path, ref.line, signal));
  if (own) return { scope: own, at: ref.line };
  for (let line = ref.line + 1; line <= Math.min(ref.line + LOOKAHEAD, lines.length); line++) {
    if (NOT_CODE.test(lines[line - 1]!)) continue;
    return { scope: innermostFunction(await search.functionAt(ref.path, line, signal)), at: line };
  }
  return { scope: null, at: ref.line };
}

/** The first line of a definition: the nearest line at or above `from` that reads `signature`, else `from`. */
function definitionLine(lines: string[], from: number, signature: string): number {
  for (let line = from; line >= 1; line--) if (lines[line - 1]?.trim() === signature.trim()) return line;
  return from;
}
