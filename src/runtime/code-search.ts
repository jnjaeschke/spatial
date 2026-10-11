import type { CodeScope, Engine, GeckoSpecRef } from "../shared/types.ts";

/** Every engine, in display order. */
export const ENGINES: readonly Engine[] = ["gecko", "blink", "webkit"];

/** Read-only code search over one engine's source tree at its current revision: the calls an engine mapping makes. */
export interface CodeSearch {
  readonly effect: "read-only";
  readonly engine: Engine;
  /** Lines linking a spec section, at most `limit` (default 30), grouped `Code` or a test group. The fragment may be matched as a prefix: callers check each line. Network. */
  specRefs(url: string, signal: AbortSignal, limit?: number): Promise<GeckoSpecRef[]>;
  /** The scopes enclosing a line, innermost first; empty outside every function and type. Network. */
  functionAt(path: string, line: number, signal: AbortSignal): Promise<CodeScope[]>;
  /** A file's text at the current revision; null when it does not exist. Network. */
  file(path: string, signal: AbortSignal): Promise<string | null>;
  /** Permalink base and the revision `file` reads. Network. */
  tip(): Promise<{ repoBase: string; rev: string }>;
}

/** The code search of an engine the runtime has no tool for: every call fails. */
export function missingCodeSearch(engine: Engine): CodeSearch {
  const fail = async (): Promise<never> => { throw new Error(`No ${engine} code search configured`); };
  return { effect: "read-only", engine, specRefs: fail, functionAt: fail, file: fail, tip: fail };
}
