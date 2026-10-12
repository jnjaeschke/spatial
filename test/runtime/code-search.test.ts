import { test } from "node:test";
import assert from "node:assert/strict";
import { missingCodeSearch, specUrlParts } from "../../src/runtime/code-search.ts";
import { escapeRegex } from "../../src/shared/regex.ts";
import { searchfoxCodeSearch } from "../../src/runtime/searchfox.ts";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import { corePlugin, createRuntime } from "../../src/runtime/create.ts";
import { ENGINES } from "../../src/runtime/code-search.ts";

const signal = new AbortController().signal;

test("missingCodeSearch fails every call with the engine named", async () => {
  const code = missingCodeSearch("blink");
  assert.deepEqual([code.pinned, code.heuristicScopes], [true, false]);
  await assert.rejects(code.tip(), /No blink code search configured/);
  await assert.rejects(code.file("a.cc", signal), /No blink code search configured/);
});

test("searchfoxCodeSearch passes calls through, reads a missing file as null, and keeps other failures", async () => {
  const searchfox = {
    specRefs: async (_url: string, _signal: AbortSignal, limit?: number) => [{ group: "Code", path: "a.cpp", line: limit ?? 0, url: "u" }],
    functionAt: async () => [{ symbol: "_Z1av", signature: "void a() {" }],
    file: async (path: string) => { if (path === "a.cpp") return "text"; throw new Error(path === "gone.cpp" ? "searchfox-cli exited with code 1: Error: Request failed: 404 Not Found" : "searchfox-cli exited with code 1: network unreachable"); },
    tip: async () => ({ repoBase: "https://searchfox.org/mozilla-central/", rev: "abc" }),
  } as unknown as SearchfoxCapability;
  const code = searchfoxCodeSearch("gecko", searchfox);
  assert.deepEqual([code.pinned, code.heuristicScopes], [true, false]);
  assert.deepEqual([code.engine, code.effect], ["gecko", "read-only"]);
  assert.deepEqual(await code.specRefs("u", signal, 500), [{ group: "Code", path: "a.cpp", line: 500, url: "u" }]);
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

test("Runtime: Gecko code search wraps searchfox by default, engines without a tool fail loudly, options override", async () => {
  const searchfox = { tip: async () => ({ repoBase: "https://searchfox.org/mozilla-central/", rev: "r" }) } as unknown as SearchfoxCapability;
  const options = { store: new Store(":memory:"), plugins: [corePlugin], llm: {} as LlmService, git: () => ({}) as GitCapability, webspec: {} as WebspecCapability, searchfox };
  const rt = new Runtime(options);
  assert.equal((await rt.codeSearch.gecko.tip()).rev, "r");
  await assert.rejects(rt.codeSearch.blink.tip(), /No blink code search configured/);
  const blink = { ...missingCodeSearch("blink") };
  assert.equal(new Runtime({ ...options, store: new Store(":memory:"), codeSearch: { blink } }).codeSearch.blink, blink);
});

test("createRuntime wires every engine", () => {
  const rt = createRuntime({ dbPath: ":memory:", chromiumSearchBin: "/x/chromium-search" });
  assert.deepEqual(ENGINES.map((engine) => [rt.codeSearch[engine].engine, rt.codeSearch[engine].pinned, rt.codeSearch[engine].heuristicScopes]), [["gecko", true, false], ["blink", false, true], ["webkit", true, false]]);
});
