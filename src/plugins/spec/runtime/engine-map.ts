import { basename } from "node:path";
import type { CodeScope, CodeSearch, GeckoSpecRef, WebspecCapability } from "../../../plugin-api.ts";
import type { EngineSite, EngineStep, EngineTest } from "../shared/types.ts";
import { byPlace, followQuote, fromLinks, fragmentOf, innermostFunction, isCodePath, linksAnchor, quoteProblem, siteKey } from "../shared/engine.ts";

/** A place the LLM search proposes, unverified: a line it read and that line's exact text. */
export interface ImplementationCandidate { path: string; line: number; quote: string; why: string }

/** Checks an LLM candidate: a code path (`isCodePath`) whose file at the current revision has the quote as its line (`quoteProblem`). A passing candidate becomes an `llm` site at the first line of the function it is in, or a declaration site at its line outside functions. */
export async function verifyCandidate(search: Pick<CodeSearch, "file" | "functionAt">, candidate: ImplementationCandidate, signal: AbortSignal): Promise<{ ok: true; site: EngineSite } | { ok: false; reason: string }> {
  if (!isCodePath(candidate.path)) return { ok: false, reason: `${candidate.path} is not a code file` };
  const text = await search.file(candidate.path, signal);
  const problem = quoteProblem(text, candidate);
  if (problem) return { ok: false, reason: problem };
  const lines = text!.split("\n");
  const scope = innermostFunction(await search.functionAt(candidate.path, candidate.line, signal));
  const line = scope ? definitionLine(lines, candidate.line, scope.signature) : candidate.line;
  return { ok: true, site: { path: candidate.path, line, symbol: scope?.symbol ?? "", signature: scope?.signature ?? lines[candidate.line - 1]!.trim(), quote: (lines[line - 1] ?? "").trim(), method: "llm", refs: [], steps: [], why: candidate.why } };
}

/** Searchfox's default is 50; `#navigate` alone has 44 references in Gecko. */
const REF_LIMIT = 500;
const LOOKAHEAD = 5;
const NOT_CODE = /^\s*(?:$|\/\/|\/\*|\*|#)/;
/** A line that completes a declaration or statement: the comment above it is about it, not about a definition further down. */
const COMPLETE = /[;}]\s*$/;

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

/** The function a reference is in; for a reference outside functions, the function defined within the next 5 code lines (template, attribute and macro lines may come first, preprocessor lines are skipped) until a line completes a declaration; else none, `at` the first code line below the reference (or the reference). */
async function enclosing(search: Pick<CodeSearch, "functionAt">, ref: GeckoSpecRef, lines: string[], signal: AbortSignal): Promise<{ scope: CodeScope | null; at: number }> {
  const own = innermostFunction(await search.functionAt(ref.path, ref.line, signal));
  if (own) return { scope: own, at: ref.line };
  let first: number | null = null;
  for (let line = ref.line + 1; line <= Math.min(ref.line + LOOKAHEAD, lines.length); line++) {
    if (NOT_CODE.test(lines[line - 1]!)) continue;
    first ??= line;
    const scope = innermostFunction(await search.functionAt(ref.path, line, signal));
    if (scope) return { scope, at: line };
    if (COMPLETE.test(lines[line - 1]!)) break;
  }
  return { scope: null, at: first ?? ref.line };
}

/** The first line of a definition: the nearest line at or above `from` that reads `signature`, else `from`. */
function definitionLine(lines: string[], from: number, signature: string): number {
  for (let line = from; line >= 1; line--) if (lines[line - 1]?.trim() === signature.trim()) return line;
  return from;
}

/** Tier 2: `sites` with the Step comments of their functions, checked by webspec-index `analyze`. A comment counts for a site when its scope links exactly `anchor` and it lies in the site's function; mismatches are kept with their verdict. */
export async function addSteps(search: Pick<CodeSearch, "functionAt">, analyze: WebspecCapability["analyze"], anchor: string, sites: EngineSite[], files: ReadonlyMap<string, string[]>, signal: AbortSignal): Promise<EngineSite[]> {
  const steps = new Map<string, EngineStep[]>();
  for (const path of new Set(sites.filter((site) => site.symbol).map((site) => site.path))) {
    const symbols = new Set(sites.filter((site) => site.path === path && site.symbol).map((site) => site.symbol));
    const checks = (await analyze(basename(path), files.get(path)!.join("\n"), signal)).filter((check) => fragmentOf(check.url) === anchor);
    for (const check of checks) {
      const scope = innermostFunction(await search.functionAt(path, check.line, signal));
      if (!scope || !symbols.has(scope.symbol)) continue;
      const key = `${path}|${scope.symbol}`;
      if (!steps.has(key)) steps.set(key, []);
      steps.get(key)!.push({ step: check.step, line: check.line, verdict: check.result === "exact" || check.result === "fuzzy" ? "match" : "mismatch", detail: `webspec-index: ${check.result}.${check.text ? ` The comment says: “${check.text}”` : ""}` });
    }
  }
  return sites.map((site) => site.symbol ? { ...site, steps: steps.get(siteKey(site)) ?? [] } : site);
}

/** The LLM and user sites of a previous mapping at the current revision: kept while their quote is at their line, moved to the nearest line with it, or marked stale when it (or the file, `file` null) is gone. Sites tier 1 found again (`fresh`) are not carried. */
export async function carryOver(file: (path: string) => Promise<string[] | null>, previous: EngineSite[], fresh: EngineSite[]): Promise<EngineSite[]> {
  const found = new Set(fresh.map(siteKey));
  const out: EngineSite[] = [];
  for (const site of previous) {
    if (fromLinks(site) || found.has(siteKey(site))) continue;
    const lines = await file(site.path);
    const line = lines ? followQuote(lines, site.line, site.quote) : null;
    const { stale: _stale, ...rest } = site;
    out.push(line === null ? { ...rest, stale: true } : { ...rest, line });
  }
  return out;
}
