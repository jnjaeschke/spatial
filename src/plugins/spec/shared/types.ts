import type { Engine, GeckoSpecRef, Id, ResolvedSpec, SpecEffect, SpecEffectsStatus, SpecSearchResult } from "../../../plugin-api.ts";
import type { SpecStep } from "./steps.ts";

/** The effects attributed to one step: `direct` at the effect's own site, `path` where a witness path leaves the algorithm. */
export interface StepEffect { effectId: string; via: "direct" | "path" }
/** Data of a `SpecAlgorithm` artifact (verified source fact): one webspec-index section at `sha`, stored once per (`ref`, `sha`) per session. `effects` lists all effects of the section; `stepEffects` is keyed by dotted step path. */
export interface SpecAlgorithmData { ref: string; spec: string; anchor: string; title: string; type: string; url: string; content: string; sha: string; outgoingRefs: number; effects: SpecEffect[]; effectsStatus: SpecEffectsStatus; stepEffects: Record<string, StepEffect[]> }
/** Data of a `SpecOpened` artifact (user): a box was opened as a root (`from` null) or from step `from.step` (empty when the link is outside any step) of box `from.anchor`. Refs are `SPEC#anchor`. */
export interface SpecOpenedData { anchor: string; from: { anchor: string; step: string } | null }
/** How a trace walk reached an entry from the previous one. */
/** How a trace walk reaches an entry from the previous one. */
export const TRACE_HOPS = ["start", "call", "return", "next", "async"] as const;
export type TraceHop = typeof TRACE_HOPS[number];
/** The question a generated trace answers. */
export interface TraceQuestion { mode: "claim" | "scenario"; text: string }
/** The tracer's answer to a claim (LLM interpretation; shown only with its trace and counts). */
export interface TraceVerdict { answer: "holds" | "fails" | "unclear"; reasoning: string }
export type TraceCodeRef = CodeCitation & { engine: Engine };
export interface SpecTraceEntry { anchor: string; step: string; note: string; /** Set on generated traces. */ hop?: TraceHop; /** Set on generated traces: code lines the tracer cites for this step, verbatim. */ code?: TraceCodeRef[] }
/** Data of a `SpecTrace` artifact (user); the latest artifact per `traceId` is the trace. */
export interface SpecTraceData { traceId: string; title: string; entries: SpecTraceEntry[]; /** Set on generated traces and the user versions that supersede them. */ question?: TraceQuestion; /** Set on generated traces: the tracer's answer to a claim, null for a scenario. */ verdict?: TraceVerdict | null }
/** The structured reply of task `traceSpec`. */
export interface GeneratedTrace { title: string; entries: { anchor: string; step: string; note: string; hop: TraceHop; code: TraceCodeRef[] }[]; verdict: TraceVerdict | null }
/** A deterministic hop check; `reason` is empty when it passes. */
export interface HopResult { ok: boolean; reason: string }
/** The adversarial verdict on one note. */
export interface NoteResult { supported: boolean; reason: string }
/** Data of a `SpecTraceCheck` artifact: the checks of one `SpecTrace` version (`traceArtifactId`), index-aligned with its entries (`notes` null for an empty note), and the verdict of the generation the trace belongs to. */
export interface SpecTraceCheckData { traceId: string; traceArtifactId: string; verdict: TraceVerdict | null; hops: HopResult[]; notes: (NoteResult | null)[]; code: { entry: number; ref: number; url: string }[]; droppedCode: { entry: number; ref: number; reason: string }[] }
/** Data of a `SpecExploreRequest` artifact: sections a chat reply proposed to explore. */
export interface SpecExploreRequestData { anchors: string[]; /** A claim or scenario to trace once the boxes are open. */ question: TraceQuestion | null }
/** Data of a `SummaryRejected` artifact: the summary of `anchor` at `sha` failed a check in this session. */
export interface SummaryRejectedData { anchor: string; sha: string; reasons: string[] }
/** Data of a `SpecSearch` artifact: the results of a search phrase, best first. */
export interface SpecSearchData { phrase: string; results: SpecSearchResult[] }
/** A verified summary, stored in the knowledge store under `spec` / `<ref>@<sha>`. */
export interface SpecSummary { clauses: { text: string; steps: string[] }[] }

/** A Step comment (`match`/`mismatch`, webspec-index's verdict) or a proposed range (`proposed`, lines `line`–`end`, `detail` its reason, `origin` `align` for `alignSteps` or `trace` for a spec trace's code reference). `alignSteps` replaces only `align` steps; every proposed step moves with its site and survives a re-derivation or a concurrent mapping run. */
export interface EngineStep { step: string; line: number; end?: number; verdict: "match" | "mismatch" | "proposed"; detail: string; quote?: string; origin?: "align" | "trace"; /** The text of the Step comment this step comes from. */ comment?: string }
/**
 * Where an engine implements an algorithm: a function (`symbol` its code-search symbol, `signature` its first line, `line` the first line of
 * its definition) or, for concepts, a declaration (`symbol` ""). `quote` is the code at `line` when stored. `method`: found through spec-link
 * comments (on lines `refs`), with `spec-link-heuristic` naming a function found by brace scan, proposed by the LLM (`why`), or confirmed by the user. `stale`: the quote is gone at the mapping's revision.
 */
export interface EngineSite { path: string; line: number; symbol: string; signature: string; quote: string; method: "spec-link" | "spec-link-heuristic" | "llm" | "user"; /** Lines of the spec-link comments, in `declaration.path` when set. */ refs: number[]; steps: EngineStep[]; why?: string; stale?: true; /** The C/C++ header declaration this definition was found from: the spec-link comment or the LLM pointed there. */ declaration?: { path: string; line: number } }
/** A test line linking the algorithm; `group` as code search reports it (`Web-Platform Test`, `Test`, …). */
export interface EngineTest { group: string; path: string; line: number }
/** Knowledge value under `spec` / `impl|<engine>|<SPEC#anchor>`: an algorithm's sites and tests in one engine at revision `rev` of `repoBase`; `rejected` are proposals the user rejected, never proposed again. */
export interface EngineMapping { engine: Engine; repoBase: string; rev: string; sites: EngineSite[]; tests: EngineTest[]; rejected: Pick<EngineSite, "path" | "line" | "symbol" | "signature">[]; checkedAt: string }

export type DifferenceKind = "order" | "missing" | "extra" | "condition" | "other";
/** A cited code line: `quote` is the text the LLM says is at `line`. */
export interface CodeCitation { path: string; line: number; quote: string }
export interface EngineDifference { kind: DifferenceKind; steps: string[]; summary: string; claims: { engine: Engine; text: string; code: CodeCitation[] }[] }
export interface EngineComparison { differences: EngineDifference[] }
/** A verified comparison and a digest per engine of the sites it used. */
export interface StoredComparison { comparison: EngineComparison; dropped: number; basedOn: Partial<Record<Engine, string>> }
/** What the overview shows of a comparison. */
export type ComparisonView = { state: "absent" } | { state: "ready"; entryId: string; differences: (EngineDifference & { index: number })[]; dropped: number; flagged: number; outdated: boolean };

/** The implementations overview: spec steps, each engine's stored mapping and its comparison. */
export interface ImplementationsData { ref: string; title: string; algorithmId: Id; steps: SpecStep[]; mappings: Record<Engine, EngineMapping | null>; comparison: ComparisonView }

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
