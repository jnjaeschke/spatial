import type { CodeScope, Engine, TaskRecord } from "../../../plugin-api.ts";
import type { EngineMapping, EngineSite, EngineStep } from "./types.ts";

/** Knowledge key (namespace `spec`) of an algorithm's mapping in one engine. */
export const mappingKey = (engine: Engine, ref: string) => `impl|${engine}|${ref}`;

/** Identity of a site in a mapping: path and symbol, or path and line for a declaration. */
export const siteKey = (site: Pick<EngineSite, "path" | "symbol" | "line">) => site.symbol ? `${site.path}|${site.symbol}` : `${site.path}:${site.line}`;

/** Site order: by path, then line. */
export const byPlace = (a: Pick<EngineSite, "path" | "line">, b: Pick<EngineSite, "path" | "line">) => a.path.localeCompare(b.path) || a.line - b.line;

/** Whether tier 1 derives a site from spec-link comments: every mapping run recomputes such sites, so they are never carried over or merged back. */
export const fromLinks = (site: Pick<EngineSite, "method">) => site.method === "spec-link" || site.method === "spec-link-heuristic";

/** `steps` moved by `offset` lines. */
export const shiftSteps = (steps: EngineStep[], offset: number) => steps.map((step) => ({ ...step, line: step.line + offset, ...(step.end !== undefined ? { end: step.end + offset } : {}) }));

/** Freshly derived spec-link sites, each with the proposed steps of the previous site of the same key, moved by as much as the site moved. */
export function keepAlignedSteps(previous: EngineSite[], fresh: EngineSite[]): EngineSite[] {
  return fresh.map((site) => {
    const before = previous.find((old) => fromLinks(old) && siteKey(old) === siteKey(site));
    const kept = before ? shiftSteps(before.steps.filter((step) => step.verdict === "proposed"), site.line - before.line) : [];
    return kept.length ? { ...site, steps: [...site.steps, ...kept] } : site;
  });
}

/** A mapping run's `result` with what was stored while it ran (`latest`): rejections, confirmations of the result's proposals, proposals the result lacks, and step alignments (moved with their site). Sites tier 1 derives come from `result` only. */
export function mergeLatest(result: EngineMapping, latest: EngineMapping): EngineMapping {
  const rejected = [...result.rejected, ...latest.rejected.filter((site) => !result.rejected.some((known) => siteKey(known) === siteKey(site)))];
  const gone = new Set(rejected.map(siteKey));
  const byKey = new Map(latest.sites.map((site) => [siteKey(site), site]));
  const sites = result.sites.filter((site) => !gone.has(siteKey(site))).map((site) => {
    const now = byKey.get(siteKey(site));
    if (!now) return site;
    const method: EngineSite["method"] = site.method === "llm" && now.method === "user" ? "user" : site.method;
    const aligned = site.steps.some((step) => step.verdict === "proposed") ? [] : shiftSteps(now.steps.filter((step) => step.verdict === "proposed"), site.line - now.line);
    return { ...site, method, steps: [...site.steps, ...aligned] };
  });
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
export const codeUrl = (mapping: Pick<EngineMapping, "engine" | "repoBase" | "rev">, path: string, line: number) => mapping.engine === "blink" ? `${mapping.repoBase}+/${mapping.rev}:${path};l=${line}` : `${mapping.repoBase}rev/${mapping.rev}/${path}#${line}`;

/** Where `quote` is in `lines` (1-based): `line` while it is still there, else the one nearest line with the same trimmed text; null when it is gone or two copies are equally near. */
export function followQuote(lines: string[], line: number, quote: string): number | null {
  const wanted = quote.trim();
  if (lines[line - 1]?.trim() === wanted) return line;
  const found = lines.flatMap((text, index) => text.trim() === wanted ? [index + 1] : []).sort((a, b) => Math.abs(a - line) - Math.abs(b - line));
  return found.length && (found.length === 1 || Math.abs(found[0]! - line) !== Math.abs(found[1]! - line)) ? found[0]! : null;
}

/** Why a quoted code line does not hold: the file is missing, has no such line, or the trimmed line is not the trimmed, non-empty quote. Null when it holds. */
export function quoteProblem(text: string | null, ref: { path: string; line: number; quote: string }): string | null {
  if (text === null) return `${ref.path} does not exist`;
  const quote = ref.quote.trim();
  if (!quote) return "the quote is empty";
  const actual = text.split("\n")[ref.line - 1];
  if (actual === undefined) return `${ref.path} has no line ${ref.line}`;
  return actual.trim() === quote ? null : `${ref.path}:${ref.line} does not read \`${ref.quote}\``;
}

/** The Step comments mapped to `step` across a mapping's sites; stale sites are left out. */
export const mappedSteps = (mapping: EngineMapping, step: string) => mapping.sites.flatMap((site) => site.stale ? [] : site.steps.filter((mapped) => mapped.step === step).map((mapped) => ({ site, step: mapped })));

const ENGINE_TASKS = ["mapEngine", "findImplementation"];
const taskTarget = (task: Pick<TaskRecord, "kind" | "input">) => `${task.kind}|${(task.input as { algorithmId?: string } | null)?.algorithmId}|${(task.input as { engine?: string } | null)?.engine}`;

/** The engine tasks that matter to the explorer, oldest first: those pending or running, and the failed one that is the latest of its kind, algorithm and engine. */
export function engineTasks<T extends Pick<TaskRecord, "kind" | "status" | "input">>(tasks: T[]): T[] {
  const latest = new Map<string, T>();
  for (const task of tasks) if (ENGINE_TASKS.includes(task.kind)) latest.set(taskTarget(task), task);
  return tasks.filter((task) => ENGINE_TASKS.includes(task.kind) && (task.status === "pending" || task.status === "running" || (task.status === "failed" && latest.get(taskTarget(task)) === task)));
}

/** Whether a mapping or an LLM search of the algorithm in `engine` is pending or running, and the error of its latest failed one, from `engineTasks`. */
export function engineActivity(tasks: Pick<TaskRecord, "kind" | "status" | "input" | "error">[], algorithmId: string, engine: Engine): { mapping: boolean; searching: boolean; error: string | null } {
  const mine = tasks.filter((task) => (task.input as { algorithmId?: string } | null)?.algorithmId === algorithmId && (task.input as { engine?: string } | null)?.engine === engine);
  const running = (kind: string) => mine.some((task) => task.kind === kind && (task.status === "pending" || task.status === "running"));
  return { mapping: running("mapEngine"), searching: running("findImplementation"), error: mine.findLast((task) => task.status === "failed")?.error ?? null };
}

/** A stored value as an `EngineMapping`; throws when it does not have the shape. */
export function engineMapping(value: unknown): EngineMapping {
  const m = value as Partial<EngineMapping> | null;
  if (typeof m !== "object" || m === null || typeof m.engine !== "string" || typeof m.repoBase !== "string" || typeof m.rev !== "string" || typeof m.checkedAt !== "string" || !Array.isArray(m.sites) || !Array.isArray(m.tests) || !Array.isArray(m.rejected)) throw new Error("Stored engine mapping has an unexpected shape");
  if (m.sites.some((site) => !site || typeof site !== "object" || !Array.isArray(site.steps) || site.steps.some((step) => !step || typeof step !== "object" || ("origin" in step && step.origin !== "align" && step.origin !== "trace")))) throw new Error("Stored engine mapping has an unexpected shape");
  return m as EngineMapping;
}
