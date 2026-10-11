import type { SearchfoxCapability } from "../../../src/runtime/tasks.ts";
import type { EngineMapping, EngineSite } from "../../../src/plugins/spec/shared/types.ts";

export const NAVIGATE = { symbol: "_ZN7mozilla3dom15BrowsingContext8NavigateEv", signature: "void BrowsingContext::Navigate(" };
export const INTERNAL_LOAD = { symbol: "_ZN10nsDocShell12InternalLoadEv", signature: "nsresult nsDocShell::InternalLoad(nsDocShellLoadState* aLoadState," };
const FILES: Record<string, { length: number; line: number; text: string }> = {
  "docshell/base/BrowsingContext.cpp": { length: 2735, line: 2648, text: NAVIGATE.signature },
  "docshell/base/nsDocShell.cpp": { length: 9100, line: 8400, text: INTERNAL_LOAD.signature },
  "dom/Fourth.cpp": { length: 9, line: 1, text: "void Fourth::One() {" },
};
export const searchfox: SearchfoxCapability = {
  effect: "read-only", async define() { return null; }, async specRefs() { return []; },
  async functionAt(path, line) {
    if (path === "docshell/base/BrowsingContext.cpp" && line >= 2648 && line <= 2735) return [NAVIGATE];
    if (path === "docshell/base/nsDocShell.cpp") return [INTERNAL_LOAD];
    if (path === "dom/Fourth.cpp") return [{ symbol: "_ZN6Fourth3OneEv", signature: "void Fourth::One() {" }];
    return [];
  },
  async file(path) { const file = FILES[path]; if (!file) throw new Error("searchfox-cli exited with code 1: Error: Request failed: 404 Not Found"); return Array.from({ length: file.length }, (_, i) => i + 1 === file.line ? file.text : "").join("\n"); },
  async tip() { return { repoBase: "https://searchfox.org/mozilla-central/", rev: "a".repeat(40) }; },
};
export const CANDIDATE = { path: "docshell/base/BrowsingContext.cpp", line: 2648, quote: NAVIGATE.signature, why: "Navigates." };
export const NAVIGATE_SITE: EngineSite = { path: "docshell/base/BrowsingContext.cpp", line: 2648, symbol: NAVIGATE.symbol, signature: NAVIGATE.signature, quote: NAVIGATE.signature, method: "llm", refs: [], steps: [], why: "Navigates." };
export const mapping = (sites: EngineSite[] = [], rejected: EngineMapping["rejected"] = []): EngineMapping => ({ engine: "gecko", repoBase: "https://searchfox.org/mozilla-central/", rev: "a".repeat(40), sites, tests: [], rejected, checkedAt: new Date().toISOString() });
