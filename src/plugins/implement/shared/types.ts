import type { DiagramData, WriteMode } from "../../../plugin-api.ts";
import type { SpecReferenceData } from "../../review/api.ts";

/** Recorded (verified) by the start: where the work lives; `baseSha` is the commit the branch started from, or the fork point of the current branch from main for `current-branch`. */
export interface ImplementBranchData { branch: string; baseSha: string; baseRef: string | null; profile: string; checkout: "new-branch" | "current-branch" }
/** A source location cited by an investigation. */
export interface InvestigationLocation { path: string; line: number; quote: string; why: string }
/** One planned implementation step. */
export interface InvestigationStep { title: string; message: string; intent: string; tests: string[] }
/** The contract any investigate phase must produce (artifact `Investigation`, status proposed). `exploration` is the handoff to the implement agent, which starts without the investigator's context. `diagram` and `specRefs` are optional; `droppedLocations` and `diagramError` are set by the runtime. */
export interface InvestigationData {
  kind: "bugfix" | "feature" | "spec" | "perf"; summary: string;
  bug: number | null;
  locations: InvestigationLocation[];
  testCases: { description: string; expected: string; actual?: string; path?: string }[];
  architecture?: string;
  steps: InvestigationStep[];
  openQuestions: string[];
  exploration: { tried: string; outcome: string }[];
  diagram?: DiagramData;
  specRefs?: SpecReferenceData[];
  droppedLocations?: string[];
  diagramError?: string;
}
/** A shell command an agent ran (source fact; artifact `CommandRun`, verified). `test` is true when the profile's `isTestCommand` matches. `output` is capped at 256 KB. */
export interface CommandRunData { command: string; exitCode: number; durationMs: number; output: string; test: boolean }
/** The implement agent's structured result. */
export interface ImplementResultData { head: string; branch: string; summary: string; planChange: string | null; planInvalid: string | null }
/** A rewrite of the stack by a tool the user confirmed (moz-phab adds trailers to every commit): implement accepts `to` as its own tip. Artifact `StackRewrite`, verified. */
export interface StackRewriteData { from: string; to: string; by: string }
