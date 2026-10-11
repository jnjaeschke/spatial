import { test } from "node:test";
import assert from "node:assert/strict";
import { specLinkSites } from "../../../src/plugins/spec/runtime/engine-map.ts";
import type { CodeSearch } from "../../../src/runtime/code-search.ts";
import type { CodeScope, GeckoSpecRef } from "../../../src/shared/types.ts";

const signal = new AbortController().signal;
const NAVIGATE = { symbol: "_ZN7mozilla3dom15BrowsingContext8NavigateEv", signature: "void BrowsingContext::Navigate(" };
const NS = { symbol: "NS_mozilla::dom", signature: "namespace dom {" };
const LOAD_STATE = { symbol: "T_nsDocShellLoadState", signature: "class nsDocShellLoadState final {" };
const HAS = { symbol: "_ZNK19nsDocShellLoadState16HasSourceElementEv", signature: "bool HasSourceElement() const { return true; }" };
const FILES: Record<string, string[]> = {
  "docshell/base/BrowsingContext.cpp": [
    "// https://html.spec.whatwg.org/#navigate",
    "// In its current state, this method is not closely following the spec.",
    "void BrowsingContext::Navigate(",
    "    nsIURI* aURI) {",
    "  if (failed) {",
    "    // https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate",
    "    return;",
    "  }",
    "}",
    "",
    "// https://html.spec.whatwg.org/#navigate-fragid",
    "void Other() {}",
  ],
  "docshell/base/nsDocShellLoadState.h": [
    "class nsDocShellLoadState final {",
    "  // This is used as the parameter for https://html.spec.whatwg.org/#navigate",
    "  void SetSourceElement(Element* aElement);",
    "  bool HasSourceElement() const { return true; }",
    "};",
  ],
  "testing/web-platform/tests/a.html": ["<!doctype html>", "<link rel=help href=\"https://html.spec.whatwg.org/#navigate\">"],
  "testing/web-platform/tests/b.html": ["<!doctype html>", "<link rel=help href=\"https://html.spec.whatwg.org/#navigate-fragid\">"],
};
const SCOPES: Record<string, (line: number) => CodeScope[]> = {
  "docshell/base/BrowsingContext.cpp": (line) => line >= 3 && line <= 9 ? [NAVIGATE, NS] : line === 12 ? [{ symbol: "_Z5Otherv", signature: "void Other() {}" }, NS] : [NS],
  "docshell/base/nsDocShellLoadState.h": (line) => line === 4 ? [HAS, LOAD_STATE] : [LOAD_STATE],
};
const ref = (group: string, path: string, line: number): GeckoSpecRef => ({ group, path, line, url: `https://searchfox.org/mozilla-central/source/${path}#${line}` });

function fakeSearch(refs: GeckoSpecRef[]) {
  const calls: string[] = [];
  const search: Pick<CodeSearch, "specRefs" | "functionAt" | "file"> = {
    async specRefs(url, _signal, limit) { calls.push(`specRefs ${url} ${limit}`); return refs; },
    async functionAt(path, line) { calls.push(`functionAt ${path}:${line}`); return SCOPES[path]?.(line) ?? []; },
    async file(path) { calls.push(`file ${path}`); return FILES[path]?.join("\n") ?? null; },
  };
  return { search, calls };
}

test("references group into one site per function, with a comment above the definition, and declarations of their own", async () => {
  const { search, calls } = fakeSearch([
    ref("Code", ".agents/skills/specmap/SKILL.md", 25),
    ref("Code", "docshell/base/BrowsingContext.cpp", 1),
    ref("Code", "docshell/base/BrowsingContext.cpp", 6),
    ref("Code", "docshell/base/BrowsingContext.cpp", 11),
    ref("Code", "docshell/base/nsDocShellLoadState.h", 2),
    ref("Code", "docshell/base/Gone.cpp", 4),
    ref("Web-Platform Test", "testing/web-platform/tests/a.html", 2),
    ref("Web-Platform Test", "testing/web-platform/tests/b.html", 2),
  ]);
  const { sites, tests } = await specLinkSites(search, { url: "https://html.spec.whatwg.org/#navigate", anchor: "navigate" }, signal);
  assert.deepEqual(sites, [
    { path: "docshell/base/BrowsingContext.cpp", line: 3, symbol: NAVIGATE.symbol, signature: "void BrowsingContext::Navigate(", quote: "void BrowsingContext::Navigate(", method: "spec-link", refs: [1, 6], steps: [] },
    { path: "docshell/base/nsDocShellLoadState.h", line: 3, symbol: "", signature: "void SetSourceElement(Element* aElement);", quote: "void SetSourceElement(Element* aElement);", method: "spec-link", refs: [2], steps: [] },
  ]);
  assert.deepEqual(tests, [{ group: "Web-Platform Test", path: "testing/web-platform/tests/a.html", line: 2 }]);
  assert.equal(calls[0], "specRefs https://html.spec.whatwg.org/#navigate 500");
  assert.ok(!calls.some((call) => call.includes("SKILL.md")), "documentation is never fetched");
  assert.ok(!calls.includes("functionAt docshell/base/BrowsingContext.cpp:2"), "comment lines are skipped");
  assert.ok(!calls.includes("functionAt docshell/base/nsDocShellLoadState.h:4"), "only the first code line below a comment is looked at");
  assert.ok(!calls.includes("functionAt docshell/base/BrowsingContext.cpp:11"), "a prefix match is dropped before any lookup");
  assert.ok(!calls.includes("functionAt docshell/base/Gone.cpp:4"), "a reference to a missing file is dropped with it");
});

test("a section only tests link has no sites", async () => {
  const { search } = fakeSearch([ref("Web-Platform Test", "testing/web-platform/tests/a.html", 2)]);
  const { sites, tests } = await specLinkSites(search, { url: "https://html.spec.whatwg.org/#navigate", anchor: "navigate" }, signal);
  assert.deepEqual([sites, tests.length], [[], 1]);
});
