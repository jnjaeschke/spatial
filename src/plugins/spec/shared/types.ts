import type { Engine, GeckoSpecRef, Id, ResolvedSpec, SpecEffect, SpecEffectsStatus, SpecSearchResult } from "../../../plugin-api.ts";

/** The effects attributed to one step: `direct` at the effect's own site, `path` where a witness path leaves the algorithm. */
export interface StepEffect { effectId: string; via: "direct" | "path" }
/** Data of a `SpecAlgorithm` artifact (verified source fact): one webspec-index section at `sha`, stored once per (`ref`, `sha`) per session. `effects` lists all effects of the section; `stepEffects` is keyed by dotted step path. */
export interface SpecAlgorithmData { ref: string; spec: string; anchor: string; title: string; type: string; url: string; content: string; sha: string; outgoingRefs: number; effects: SpecEffect[]; effectsStatus: SpecEffectsStatus; stepEffects: Record<string, StepEffect[]> }
/** Data of a `SpecOpened` artifact (user): a box was opened as a root (`from` null) or from step `from.step` (empty when the link is outside any step) of box `from.anchor`. Refs are `SPEC#anchor`. */
export interface SpecOpenedData { anchor: string; from: { anchor: string; step: string } | null }
export interface SpecTraceEntry { anchor: string; step: string; note: string }
/** Data of a `SpecTrace` artifact (user); the latest artifact per `traceId` is the trace. */
export interface SpecTraceData { traceId: string; title: string; entries: SpecTraceEntry[] }
/** Data of a `SpecExploreRequest` artifact: sections a chat reply proposed to explore. */
export interface SpecExploreRequestData { anchors: string[] }
/** Data of a `SummaryRejected` artifact: the summary of `anchor` at `sha` failed a check in this session. */
export interface SummaryRejectedData { anchor: string; sha: string; reasons: string[] }
/** Data of a `SpecSearch` artifact: the results of a search phrase, best first. */
export interface SpecSearchData { phrase: string; results: SpecSearchResult[] }
/** A verified summary, stored in the knowledge store under `spec` / `<ref>@<sha>`. */
export interface SpecSummary { clauses: { text: string; steps: string[] }[] }

/** A Step comment inside a mapped function: the comment's line and code, whether it matches the step's text, and why (`detail`, shown as its tooltip). */
export interface EngineStep { step: string; line: number; verdict: "match" | "mismatch"; detail: string; quote?: string }
/**
 * Where an engine implements an algorithm: a function (`symbol` its code-search symbol, `signature` its first line, `line` the first line of
 * its definition) or, for concepts, a declaration (`symbol` ""). `quote` is the code at `line` when stored. `method`: found through spec-link
 * comments (on lines `refs`), with `spec-link-heuristic` naming a function found by brace scan, proposed by the LLM (`why`), or confirmed by the user. `stale`: the quote is gone at the mapping's revision.
 */
export interface EngineSite { path: string; line: number; symbol: string; signature: string; quote: string; method: "spec-link" | "spec-link-heuristic" | "llm" | "user"; refs: number[]; steps: EngineStep[]; why?: string; stale?: true }
/** A test line linking the algorithm; `group` as code search reports it (`Web-Platform Test`, `Test`, …). */
export interface EngineTest { group: string; path: string; line: number }
/** Knowledge value under `spec` / `impl|<engine>|<SPEC#anchor>`: an algorithm's sites and tests in one engine at revision `rev` of `repoBase`; `rejected` are proposals the user rejected, never proposed again. */
export interface EngineMapping { engine: Engine; repoBase: string; rev: string; sites: EngineSite[]; tests: EngineTest[]; rejected: Pick<EngineSite, "path" | "line" | "symbol" | "signature">[]; checkedAt: string }

/** Data of a `SpecReference` artifact. `resolved` null means webspec-index could not resolve `url`. */
export interface SpecReferenceData {
  url: string;
  resolved: ResolvedSpec | null;
  /** Whether the reference was found in changed code, inferred by the narrative, or followed from a spec link. */
  origin?: "code" | "llm" | "link";
  reason?: string;
  geckoRefs: GeckoSpecRef[];
  geckoRefsError?: string;
}

export type StepLinkKind = "implements" | "partial" | "structural" | "deviates";

/** Lines `start..end` (inclusive) of one side of a file in the diff. */
export interface LineRange { path: string; side: "old" | "new"; start: number; end: number }

/** `step` is a step number of the spec section as `parseSteps` numbers it, e.g. "4.2". `structural` links (ordering, queuing, "in parallel") may have no ranges. */
export interface StepLink { step: string; kind: StepLinkKind; ranges: LineRange[]; note: string }

/** Why changed lines implement no step: glue the spec leaves implicit, failure handling it does not describe, tests, or behavior it does not call for. */
export type UnmappedReason = "plumbing" | "error-path" | "test" | "unexplained";

export interface UnmappedLines { ranges: LineRange[]; reason: UnmappedReason; note: string }

/** Data of a `SpecStepMap` artifact: which changed lines implement which steps of a spec section, over the changes the spec supports. Linked `derivedFrom → SpecReference`, `about → narrative`; latest per (spec, narrative) wins. Proposed (LLM); the runtime dropped links to unknown steps and lines outside those changes' hunks, and says so in `dropped`. */
export interface SpecStepMapData { spec: Id; narrative: Id; links: StepLink[]; /** The LLM's reasons for added lines no link covers; trimmed like links. */ unmapped: UnmappedLines[]; dropped: string[] }
