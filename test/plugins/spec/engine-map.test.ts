import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseNumbered } from "../../../src/runtime/chromium-search.ts";
import { addSteps, carryOver, specLinkSites } from "../../../src/plugins/spec/runtime/engine-map.ts";
import { fakeCode } from "../../helpers/fake-code.ts";
import type { EngineSite } from "../../../src/plugins/spec/shared/types.ts";
import type { CodeSearch } from "../../../src/runtime/code-search.ts";
import type { StepCommentCheck } from "../../../src/runtime/tasks.ts";
import type { CodeScope, GeckoSpecRef } from "../../../src/shared/types.ts";

const signal = new AbortController().signal;
const NAVIGATE = { symbol: "_ZN7mozilla3dom15BrowsingContext8NavigateEv", signature: "void BrowsingContext::Navigate(" };
const NS = { symbol: "NS_mozilla::dom", signature: "namespace dom {" };
const LOAD_STATE = { symbol: "T_nsDocShellLoadState", signature: "class nsDocShellLoadState final {" };
const HAS = { symbol: "_ZNK19nsDocShellLoadState16HasSourceElementEv", signature: "bool HasSourceElement() const { return true; }" };
const TEMPLATE = { symbol: "_Z8NavigateI1TEvT_", signature: "void Navigate(T aT) {" };
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
  "dom/base/Template.cpp": [
    "// https://html.spec.whatwg.org/#navigate",
    "#ifdef NIGHTLY_BUILD",
    "template <typename T>",
    "MOZ_CAN_RUN_SCRIPT",
    "void Navigate(T aT) {",
    "}",
  ],
  "testing/web-platform/tests/a.html": ["<!doctype html>", "<link rel=help href=\"https://html.spec.whatwg.org/#navigate\">"],
  "testing/web-platform/tests/b.html": ["<!doctype html>", "<link rel=help href=\"https://html.spec.whatwg.org/#navigate-fragid\">"],
};
const SCOPES: Record<string, (line: number) => CodeScope[]> = {
  "docshell/base/BrowsingContext.cpp": (line) => line >= 3 && line <= 9 ? [NAVIGATE, NS] : line === 12 ? [{ symbol: "_Z5Otherv", signature: "void Other() {}" }, NS] : [NS],
  "docshell/base/nsDocShellLoadState.h": (line) => line === 4 ? [HAS, LOAD_STATE] : [LOAD_STATE],
  "dom/base/Template.cpp": (line) => line >= 5 ? [TEMPLATE, NS] : [NS],
};
const ref = (group: string, path: string, line: number): GeckoSpecRef => ({ group, path, line, url: `https://searchfox.org/mozilla-central/source/${path}#${line}` });

function fakeSearch(refs: GeckoSpecRef[]) {
  const calls: string[] = [];
  const search: Pick<CodeSearch, "specRefs" | "functionAt" | "file" | "heuristicScopes"> = {
    heuristicScopes: false,
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
  assert.ok(!calls.includes("functionAt docshell/base/nsDocShellLoadState.h:4"), "a complete declaration below a comment ends the lookahead");
  assert.ok(!calls.includes("functionAt docshell/base/BrowsingContext.cpp:11"), "a prefix match is dropped before any lookup");
  assert.ok(!calls.includes("functionAt docshell/base/Gone.cpp:4"), "a reference to a missing file is dropped with it");
});

const FL = "third_party/blink/renderer/core/loader/frame_loader.cc";
const DOC = "third_party/blink/renderer/core/dom/document.h";
const FRAME_LOADER = parseNumbered(readFileSync(new URL("../../fixtures/chromium/frame_loader.cc.txt", import.meta.url), "utf8")).join("\n");
// document.h around the captured line 909: the link sits above a declaration in the class body.
const DOCUMENT_H = [...Array(905).fill(""), "class Document {", " public:", "  // Corresponds to \"9. Abort the active document of browsingContext.\"", "  // https://html.spec.whatwg.org/C/#navigate", "  void Abort();", "};"].join("\n");
const HITS = JSON.parse(readFileSync(new URL("../../fixtures/chromium/spec-links-navigate.json", import.meta.url), "utf8")) as { path: string; line: number; snippet: string }[];
const BLINK_REFS = HITS.map(({ path, line }) => ({ group: /(^|\/)web_tests\//.test(path) ? "Test" : "Code", path, line, url: "u" }));
// Each captured test file, with its captured lines at their numbers.
const TEST_FILES = (() => {
  const byPath = new Map<string, string[]>();
  for (const hit of HITS) if (hit.path.includes("/web_tests/")) { const lines = byPath.get(hit.path) ?? []; lines[hit.line - 1] = hit.snippet; byPath.set(hit.path, lines); }
  return Object.fromEntries([...byPath].map(([path, lines]) => [path, Array.from(lines, (line) => line ?? "").join("\n")]));
})();

test("Blink: the captured spec links become a declaration site, a heuristic function site and the exact-fragment tests", async () => {
  const { code } = fakeCode({ [FL]: FRAME_LOADER, [DOC]: DOCUMENT_H, ...TEST_FILES }, BLINK_REFS);
  const { sites, tests } = await specLinkSites(code, { url: "https://html.spec.whatwg.org/#navigate", anchor: "navigate" }, signal);
  assert.deepEqual(sites.map((site) => [site.path, site.line, site.symbol, site.signature, site.method, site.refs]), [
    [DOC, 910, "", "void Abort();", "spec-link", [909]],
    [FL, 1813, "FrameLoader::CancelProvisionalLoaderForNewNavigation", "bool FrameLoader::CancelProvisionalLoaderForNewNavigation() {", "spec-link-heuristic", [1816]],
  ]);
  assert.equal(tests.length, 8);
});

test("WebKit: a prefix match from --spec-refs is dropped by its line, as for Gecko", async () => {
  const file = ["void FrameLoader::loadURL() {", "  // https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate", "  // https://html.spec.whatwg.org/#navigate-fragid", "}"].join("\n");
  const { code } = fakeCode({ "Source/WebCore/loader/FrameLoader.cpp": file }, [{ group: "Code", path: "Source/WebCore/loader/FrameLoader.cpp", line: 2, url: "u" }, { group: "Code", path: "Source/WebCore/loader/FrameLoader.cpp", line: 3, url: "u" }], { engine: "webkit" });
  const { sites } = await specLinkSites(code, { url: "https://html.spec.whatwg.org/#navigate", anchor: "navigate" }, signal);
  assert.deepEqual(sites.map((site) => [site.line, site.method, site.refs]), [[1, "spec-link", [2]]]);
});

test("Step comment steps keep their comment line as quote", async () => {
  const search = { async functionAt() { return [{ symbol: "S", signature: "void S() {" }]; } };
  const site = { path: "a.cc", line: 1, symbol: "S", signature: "void S() {", quote: "void S() {", method: "spec-link-heuristic" as const, refs: [1], steps: [] };
  const analyze = async () => [{ line: 2, step: "1", text: "Edit.", result: "exact" as const, url: "https://html.spec.whatwg.org/C/#setup" }];
  const [out] = await addSteps(search, analyze, "setup", [site], new Map([["a.cc", ["void S() {", "  // Step 1. Edit.", "}"]]]), signal);
  assert.deepEqual(out!.steps, [{ step: "1", line: 2, verdict: "match", detail: "webspec-index: exact. The comment says: “Edit.”", quote: "  // Step 1. Edit." }]);
});

test("a comment above template, macro and preprocessor lines belongs to the definition below them", async () => {
  const { search } = fakeSearch([ref("Code", "dom/base/Template.cpp", 1)]);
  const { sites } = await specLinkSites(search, { url: "https://html.spec.whatwg.org/#navigate", anchor: "navigate" }, signal);
  assert.deepEqual(sites.map(({ line, symbol }) => ({ line, symbol })), [{ line: 5, symbol: TEMPLATE.symbol }]);
});

test("a section only tests link has no sites", async () => {
  const { search } = fakeSearch([ref("Web-Platform Test", "testing/web-platform/tests/a.html", 2)]);
  const { sites, tests } = await specLinkSites(search, { url: "https://html.spec.whatwg.org/#navigate", anchor: "navigate" }, signal);
  assert.deepEqual([sites, tests.length], [[], 1]);
});

const ANALYZED = JSON.parse(readFileSync(new URL("../../fixtures/webspec/nsDocShell-analyze.json", import.meta.url), "utf8"));
// What `WebspecCapability.analyze` makes of the output (1-based lines, dotted steps).
const CHECKS: StepCommentCheck[] = ANALYZED.scopes.flatMap((scope: any) => scope.validations.map((v: any) => ({ line: v.line + 1, step: v.step.join("."), text: v.comment_text, result: v.result, url: scope.url })));
const INTERNAL_LOAD = { symbol: "_ZN10nsDocShell12InternalLoadEP19nsDocShellLoadStateN7mozilla5MaybeIjEE", signature: "nsresult nsDocShell::InternalLoad(nsDocShellLoadState* aLoadState," };

test("Step comments of the algorithm inside a site's function become its steps, mismatches included", async () => {
  const lookups: number[] = [];
  const analyzed: string[] = [];
  const search = { async functionAt(_path: string, line: number) { lookups.push(line); return line >= 8769 && line <= 8775 ? [INTERNAL_LOAD] : [{ symbol: "_Z5Otherv", signature: "void Other() {" }]; } };
  const analyze = async (name: string) => { analyzed.push(name); return CHECKS; };
  const site = (path: string, symbol: string) => ({ path, line: 1, symbol, signature: "", quote: "", method: "spec-link" as const, refs: [1], steps: [] });
  const sites = [site("docshell/base/nsDocShell.cpp", INTERNAL_LOAD.symbol), site("docshell/base/nsDocShellLoadState.h", "")];
  const out = await addSteps(search, analyze, "navigate", sites, new Map([["docshell/base/nsDocShell.cpp", ["x"]], ["docshell/base/nsDocShellLoadState.h", ["y"]]]), signal);
  assert.deepEqual(out[0]!.steps.map((s) => [s.step, s.line, s.verdict]), [["20", 8769, "match"], ["21", 8772, "match"], ["21.1", 8774, "mismatch"]]);
  assert.equal(out[0]!.steps[0]!.detail, "webspec-index: exact. The comment says: “Set the ongoing navigation for navigable to navigationId.”");
  assert.equal(out[0]!.steps[2]!.detail, "webspec-index: mismatch. The comment says: “Queue a global task on the navigation and traversal task source given navigable's active window to navigate to a javascript: URL given navigable, url, historyHandling, sourceSnapshotParams, initiatorOriginSnapshot, userInvolvement, cspNavigationType, initialInsertion, and navigationId.”");
  assert.deepEqual(out[1], sites[1]);
  assert.deepEqual(analyzed, ["nsDocShell.cpp"]);
  assert.deepEqual(lookups, [8769, 8772, 8774, 8779], "navigate-fragid scopes are not looked up; 21.2 is in another function");
});

test("carried sites follow their quote, go stale without it, and yield to sites tier 1 finds", async () => {
  const site = (path: string, line: number, quote: string, method: EngineSite["method"] = "llm"): EngineSite => ({ path, line, symbol: `_Z${quote.replace(/\W/g, "")}`, signature: quote, quote, method, refs: [], steps: [] });
  const files: Record<string, string[]> = { "a.cpp": ["x", "void A() {", "}"], "b.cpp": ["", "", "", "void B() {"], "c.cpp": ["void Other() {"], "f.cpp": [] };
  const previous = [{ ...site("a.cpp", 2, "void A() {"), stale: true as const }, site("b.cpp", 1, "void B() {", "user"), site("c.cpp", 1, "void C() {"), site("gone.cpp", 1, "void G() {"), site("s.cpp", 1, "void S() {", "spec-link"), site("f.cpp", 3, "void F() {")];
  const carried = await carryOver(async (path) => files[path] ?? null, previous, [site("f.cpp", 9, "void F() {", "spec-link")]);
  assert.deepEqual(carried, [site("a.cpp", 2, "void A() {"), site("b.cpp", 4, "void B() {", "user"), { ...site("c.cpp", 1, "void C() {"), stale: true }, { ...site("gone.cpp", 1, "void G() {"), stale: true }]);
});

test("carryOver shifts a moved site's steps with it", async () => {
  const moved: EngineSite = { path: "a.cpp", line: 1, symbol: "_ZA", signature: "void A() {", quote: "void A() {", method: "user", refs: [], steps: [{ step: "1", line: 2, end: 3, quote: "x", verdict: "proposed", detail: "w", origin: "align" }] };
  const [out] = await carryOver(async () => ["", "", "void A() {", "x", "y"], [moved], []);
  assert.deepEqual([out!.line, out!.steps[0]!.line, out!.steps[0]!.end], [3, 4, 5]);
});
