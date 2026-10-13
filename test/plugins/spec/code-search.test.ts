import { test } from "node:test";
import assert from "node:assert/strict";
import { missingCodeSearch, specUrlParts } from "../../../src/plugins/spec/runtime/code-search.ts";
import { ENGINES } from "../../../src/plugins/spec/shared/engines.ts";
import { escapeRegex } from "../../../src/shared/regex.ts";
import { searchfoxCodeSearch, type SearchfoxCapability } from "../../../src/plugins/spec/runtime/searchfox.ts";
import { specServicesFromEnv } from "../../../src/plugins/spec/runtime/services.ts";

const signal = new AbortController().signal;

test("missingCodeSearch fails every call with the engine named", async () => {
  const code = missingCodeSearch("blink");
  assert.deepEqual([code.pinned, code.heuristicScopes], [true, false]);
  await assert.rejects(code.tip(), /No blink code search configured/);
  await assert.rejects(code.file("a.cc", signal), /No blink code search configured/);
  await assert.rejects(code.search("q", signal), /No blink code search configured/);
});

test("searchfoxCodeSearch passes calls through, reads a missing file as null, and keeps other failures", async () => {
  const searchfox = {
    specRefs: async (_url: string, _signal: AbortSignal, limit?: number) => [{ group: "Code", path: "a.cpp", line: limit ?? 0, url: "u" }],
    search: async (query: string, _signal: AbortSignal, limit?: number) => [{ path: "a.cpp", line: limit ?? 0, snippet: query }],
    functionAt: async () => [{ symbol: "_Z1av", signature: "void a() {" }],
    file: async (path: string) => { if (path === "a.cpp") return "text"; throw new Error(path === "gone.cpp" ? "searchfox-cli exited with code 1: Error: Request failed: 404 Not Found" : "searchfox-cli exited with code 1: network unreachable"); },
    tip: async () => ({ repoBase: "https://searchfox.org/mozilla-central/", rev: "abc" }),
  } as unknown as SearchfoxCapability;
  const code = searchfoxCodeSearch("gecko", searchfox);
  assert.deepEqual([code.pinned, code.heuristicScopes], [true, false]);
  assert.deepEqual([code.engine, code.effect], ["gecko", "read-only"]);
  assert.deepEqual(await code.specRefs("u", signal, 500), [{ group: "Code", path: "a.cpp", line: 500, url: "u" }]);
  assert.deepEqual(await code.search("q", signal, 5), [{ path: "a.cpp", line: 5, snippet: "q" }]);
  assert.deepEqual(await code.functionAt("a.cpp", 1, signal), [{ symbol: "_Z1av", signature: "void a() {" }]);
  assert.equal(await code.file("a.cpp", signal), "text");
  assert.equal(await code.file("gone.cpp", signal), null);
  await assert.rejects(code.file("b.cpp", signal), /network unreachable/);
  assert.deepEqual(await code.tip(), { repoBase: "https://searchfox.org/mozilla-central/", rev: "abc" });
});

test("specUrlParts: what every citation of a section starts with, and its decoded fragment", () => {
  assert.deepEqual(specUrlParts("https://html.spec.whatwg.org/#navigate"), { prefix: "html.spec.whatwg.org/", anchor: "navigate" });
  assert.deepEqual(specUrlParts("https://w3c.github.io/ServiceWorker/#dfn-x"), { prefix: "w3c.github.io/ServiceWorker/", anchor: "dfn-x" });
  assert.deepEqual(specUrlParts("https://html.spec.whatwg.org/multipage/browsing-the-web.html#navigate-to-a-javascript%3A-url"), { prefix: "html.spec.whatwg.org/multipage/", anchor: "navigate-to-a-javascript:-url" });
  assert.throws(() => specUrlParts("https://html.spec.whatwg.org/"), /Spec URL has no fragment/);
  assert.equal(escapeRegex("a.b/c(d)"), "a\\.b/c\\(d\\)");
});

test("specServicesFromEnv wires every engine", () => {
  const { codeSearch } = specServicesFromEnv({ SPATIAL_CHROMIUM_SEARCH_BIN: "/x/chromium-search" });
  assert.deepEqual(ENGINES.map((engine) => [codeSearch[engine].engine, codeSearch[engine].pinned, codeSearch[engine].heuristicScopes]), [["gecko", true, false], ["blink", false, true], ["webkit", true, false]]);
});
