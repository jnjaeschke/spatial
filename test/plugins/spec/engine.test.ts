import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFunctionAt, parseSpecRefs } from "../../../src/runtime/searchfox.ts";
import { codeUrl, engineMapping, followQuote, fragmentOf, innermostFunction, isCodePath, linksAnchor, mappingKey, siteKey, siteName } from "../../../src/plugins/spec/shared/engine.ts";

const fixture = (name: string) => readFileSync(new URL(`../../fixtures/searchfox/${name}`, import.meta.url), "utf8");

test("linksAnchor needs the exact fragment, in single-page and multipage URLs (lines from mozilla-central)", () => {
  assert.equal(linksAnchor("// https://html.spec.whatwg.org/#navigate", "navigate"), true);
  assert.equal(linksAnchor("      // https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate", "navigate"), true);
  assert.equal(linksAnchor("// https://html.spec.whatwg.org/#navigate.", "navigate"), true);
  assert.equal(linksAnchor('  // navigate" in https://html.spec.whatwg.org/#navigate first step 2 then 6.2.', "navigate"), true);
  assert.equal(linksAnchor('<link rel=help href="https://html.spec.whatwg.org/#navigate">', "navigate"), true);
  assert.equal(linksAnchor("  // https://html.spec.whatwg.org/#navigate-fragid", "navigate"), false);
  assert.equal(linksAnchor("// https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate-to-a-javascript:-url,", "navigate"), false);
  assert.equal(linksAnchor("// https://html.spec.whatwg.org/#navigate-to-a-javascript:-url.", "navigate-to-a-javascript:-url"), true);
  assert.equal(linksAnchor("// https://html.spec.whatwg.org/#fire-a-push%2Freplace%2Freload-navigate-event", "fire-a-push/replace/reload-navigate-event"), true);
  assert.equal(linksAnchor("// we navigate here", "navigate"), false);
});

test("fragmentOf trims trailing punctuation", () => {
  assert.equal(fragmentOf("https://html.spec.whatwg.org/#navigate."), "navigate");
  assert.equal(fragmentOf("https://html.spec.whatwg.org/#history-traversal:"), "history-traversal");
  assert.equal(fragmentOf("https://html.spec.whatwg.org/"), "");
});

test("isCodePath drops documentation and dot directories from the captured #navigate references", () => {
  const code = parseSpecRefs(fixture("navigate-spec-refs.md")).filter((ref) => ref.group === "Code");
  assert.equal(code.length, 32);
  assert.equal(code.filter((ref) => isCodePath(ref.path)).length, 18);
  assert.equal(isCodePath("dom/docs/navigation.rst"), false);
  assert.equal(isCodePath("testing/web-platform/tests/a.html"), true);
});

test("innermostFunction skips namespaces and types", () => {
  assert.equal(innermostFunction(parseFunctionAt(fixture("function-at-inside.txt")))?.signature, "void BrowsingContext::Navigate(");
  assert.equal(innermostFunction(parseFunctionAt(fixture("function-at-namespace.txt"))), null);
  assert.equal(innermostFunction(parseFunctionAt(fixture("function-at-class.txt"))), null);
  assert.equal(innermostFunction(parseFunctionAt(fixture("function-at-js.txt")))?.symbol, "#M-buildOptionList");
  assert.equal(innermostFunction([]), null);
});

test("siteName is the qualified name before the parameter list, else the place", () => {
  const site = (signature: string) => ({ signature, path: "dom/a.cpp", line: 3 });
  assert.equal(siteName(site("void BrowsingContext::Navigate(")), "BrowsingContext::Navigate");
  assert.equal(siteName(site("MOZ_CAN_RUN_SCRIPT bool FireTraverseNavigateEvent(")), "FireTraverseNavigateEvent");
  assert.equal(siteName(site("function buildOptionList(select, group, uniqueStyles) {")), "buildOptionList");
  assert.equal(siteName(site("mozilla::dom::NavigationType GetNavigationType() const;")), "GetNavigationType");
  assert.equal(siteName(site("class nsDocShellLoadState final {")), "dom/a.cpp:3");
});

test("followQuote keeps, moves or loses a quoted line, and treats two equally near copies as gone", () => {
  const lines = ["a", "  Edit();", "b", "Edit();", "c"];
  assert.equal(followQuote(lines, 2, "Edit();"), 2);
  assert.equal(followQuote(lines, 5, "Edit();"), 4);
  assert.equal(followQuote(lines, 1, "Gone();"), null);
  assert.equal(followQuote(["Edit();", "a", "b", "c", "Edit();"], 3, "Edit();"), null);
  assert.equal(followQuote(["Edit();", "a", "b", "Edit();"], 3, "Edit();"), 4);
});

test("keys, permalinks and stored values", () => {
  assert.equal(mappingKey("gecko", "HTML#navigate"), "impl|gecko|HTML#navigate");
  assert.equal(siteKey({ path: "a.cpp", symbol: "_Z1av", line: 3 }), "a.cpp|_Z1av");
  assert.equal(siteKey({ path: "a.h", symbol: "", line: 3 }), "a.h:3");
  assert.equal(codeUrl({ repoBase: "https://searchfox.org/mozilla-central/", rev: "0f".repeat(20) }, "dom/a.cpp", 4), `https://searchfox.org/mozilla-central/rev/${"0f".repeat(20)}/dom/a.cpp#4`);
  assert.throws(() => engineMapping({ engine: "gecko" }), /unexpected shape/);
});
