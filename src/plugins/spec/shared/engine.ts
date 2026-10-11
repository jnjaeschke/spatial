import type { CodeScope, Engine } from "../../../plugin-api.ts";
import type { EngineMapping, EngineSite } from "./types.ts";

/** Knowledge key (namespace `spec`) of an algorithm's mapping in one engine. */
export const mappingKey = (engine: Engine, ref: string) => `impl|${engine}|${ref}`;

/** Identity of a site in a mapping: path and symbol, or path and line for a declaration. */
export const siteKey = (site: Pick<EngineSite, "path" | "symbol" | "line">) => site.symbol ? `${site.path}|${site.symbol}` : `${site.path}:${site.line}`;

/** Site order: by path, then line. */
export const byPlace = (a: Pick<EngineSite, "path" | "line">, b: Pick<EngineSite, "path" | "line">) => a.path.localeCompare(b.path) || a.line - b.line;

/** Whether tier 1 derives a site from spec-link comments: every mapping run recomputes such sites, so they are never carried over or merged back. */
export const fromLinks = (site: Pick<EngineSite, "method">) => site.method === "spec-link";

/** A mapping run's result with rejections, confirmations and proposals stored while it ran; tier 1 sites come from the result only. */
export function mergeLatest(result: EngineMapping, latest: EngineMapping): EngineMapping {
  const rejected = [...result.rejected, ...latest.rejected.filter((site) => !result.rejected.some((known) => siteKey(known) === siteKey(site)))];
  const gone = new Set(rejected.map(siteKey));
  const byKey = new Map(latest.sites.map((site) => [siteKey(site), site]));
  const sites = result.sites.filter((site) => !gone.has(siteKey(site))).map((site) => site.method === "llm" && byKey.get(siteKey(site))?.method === "user" ? { ...site, method: "user" as const } : site);
  const added = latest.sites.filter((site) => !fromLinks(site) && !gone.has(siteKey(site)) && !sites.some((known) => siteKey(known) === siteKey(site)));
  return { ...result, sites: [...sites, ...added].sort(byPlace), rejected };
}

/** The fragment of a URL without trailing punctuation (`.,;:)]`), percent-decoded; "" without one. */
export function fragmentOf(url: string): string {
  const hash = url.indexOf("#");
  if (hash < 0) return "";
  const fragment = url.slice(hash + 1).replace(/[.,;:)\]]+$/, "");
  try { return decodeURIComponent(fragment); } catch { return fragment; }
}

/** Whether `text` holds a URL whose fragment is exactly `anchor`. Searchfox's spec-link search matches fragment prefixes (`#navigate` also finds `#navigate-fragid`), so every reference is checked against its line. */
export function linksAnchor(text: string, anchor: string): boolean {
  return [...text.matchAll(/https?:\/\/[^\s"'<>`]+/g)].some((match) => fragmentOf(match[0]) === anchor);
}

/** Whether a referencing file is code rather than documentation (`.md`, `.rst`, `.txt`) or inside a dot directory (agent skills, editor settings). */
export const isCodePath = (path: string) => !/(^|\/)\./.test(path) && !/\.(md|rst|txt)$/i.test(path);

/** The innermost function among scopes listed innermost first; namespaces (`NS_…`) and types (`T_…`) are not functions. */
export const innermostFunction = (scopes: CodeScope[]): CodeScope | null => scopes.find((scope) => !scope.symbol.startsWith("NS_") && !scope.symbol.startsWith("T_")) ?? null;

/** How the explorer names a site: the qualified name before the first `(` of its signature, else `path:line`. */
export function siteName(site: Pick<EngineSite, "signature" | "path" | "line">): string {
  return /([A-Za-z_~$][\w:~$]*)\s*\(/.exec(site.signature)?.[1] ?? `${site.path}:${site.line}`;
}

/** Permalink of a line at a mapping's revision. */
export const codeUrl = (mapping: Pick<EngineMapping, "repoBase" | "rev">, path: string, line: number) => `${mapping.repoBase}rev/${mapping.rev}/${path}#${line}`;

/** Where `quote` is in `lines` (1-based): `line` while it is still there, else the one nearest line with the same trimmed text; null when it is gone or two copies are equally near. */
export function followQuote(lines: string[], line: number, quote: string): number | null {
  const wanted = quote.trim();
  if (lines[line - 1]?.trim() === wanted) return line;
  const found = lines.flatMap((text, index) => text.trim() === wanted ? [index + 1] : []).sort((a, b) => Math.abs(a - line) - Math.abs(b - line));
  return found.length && (found.length === 1 || Math.abs(found[0]! - line) !== Math.abs(found[1]! - line)) ? found[0]! : null;
}

/** Why a quoted code line does not hold: the file is missing, has no such line, or the line does not contain the trimmed, non-empty quote. Null when it holds. */
export function quoteProblem(text: string | null, ref: { path: string; line: number; quote: string }): string | null {
  if (text === null) return `${ref.path} does not exist`;
  const quote = ref.quote.trim();
  if (!quote) return "the quote is empty";
  const actual = text.split("\n")[ref.line - 1];
  if (actual === undefined) return `${ref.path} has no line ${ref.line}`;
  return actual.includes(quote) ? null : `${ref.path}:${ref.line} does not read \`${ref.quote}\``;
}

/** A stored value as an `EngineMapping`; throws when it does not have the shape. */
export function engineMapping(value: unknown): EngineMapping {
  const m = value as Partial<EngineMapping> | null;
  if (typeof m !== "object" || m === null || typeof m.engine !== "string" || typeof m.repoBase !== "string" || typeof m.rev !== "string" || typeof m.checkedAt !== "string" || !Array.isArray(m.sites) || !Array.isArray(m.tests) || !Array.isArray(m.rejected)) throw new Error("Stored engine mapping has an unexpected shape");
  return m as EngineMapping;
}
