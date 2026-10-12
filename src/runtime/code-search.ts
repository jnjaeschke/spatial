import type { CodeScope, Engine, GeckoSpecRef } from "../shared/types.ts";

/** Every engine, in display order. */

/** Read-only code search over one engine's source tree at its current revision: the calls an engine mapping makes. `pinned`: `tip().rev` fixes the files' contents (false for a branch name). `heuristicScopes`: `functionAt` is a brace scan, not a code index. */
export interface CodeSearch {
  readonly effect: "read-only";
  readonly engine: Engine;
  readonly pinned: boolean;
  readonly heuristicScopes: boolean;
  /** Lines linking a spec section, at most `limit` (default 30), grouped `Code` or a test group. The fragment may be matched as a prefix: callers check each line. Network. */
  specRefs(url: string, signal: AbortSignal, limit?: number): Promise<GeckoSpecRef[]>;
  /** Lines whose text matches `query`, at most `limit` (default 30). Network. */
  search(query: string, signal: AbortSignal, limit?: number): Promise<{ path: string; line: number; snippet: string }[]>;
  /** The scopes enclosing a line, innermost first; empty outside every function and type. Network. */
  functionAt(path: string, line: number, signal: AbortSignal): Promise<CodeScope[]>;
  /** A file's text at the current revision; null when it does not exist. Network. */
  file(path: string, signal: AbortSignal): Promise<string | null>;
  /** Permalink base and the current revision, cached for up to an hour, so `file` may already read a newer one. Network. */
  tip(): Promise<{ repoBase: string; rev: string }>;
}

/** The code search of an engine the runtime has no tool for: every call fails. */
export function missingCodeSearch(engine: Engine): CodeSearch {
  const fail = async (): Promise<never> => { throw new Error(`No ${engine} code search configured`); };
  return { effect: "read-only", engine, pinned: true, heuristicScopes: false, specRefs: fail, search: fail, functionAt: fail, file: fail, tip: fail };
}

/** What every citation of a spec section starts with (host and directory of its URL, so specs sharing a host stay apart) and its decoded fragment. */
export function specUrlParts(url: string): { prefix: string; anchor: string } {
  const parsed = new URL(url);
  let anchor = parsed.hash.slice(1);
  try { anchor = decodeURIComponent(anchor); } catch { /* keep it as written */ }
  if (!anchor) throw new Error(`Spec URL has no fragment: ${url}`);
  return { prefix: parsed.host + parsed.pathname.slice(0, parsed.pathname.lastIndexOf("/") + 1), anchor };
}
