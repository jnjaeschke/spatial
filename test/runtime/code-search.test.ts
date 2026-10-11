import { test } from "node:test";
import assert from "node:assert/strict";
import { missingCodeSearch } from "../../src/runtime/code-search.ts";
import { searchfoxCodeSearch } from "../../src/runtime/searchfox.ts";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { LlmService } from "../../src/runtime/llm/types.ts";
import { corePlugin } from "../../src/runtime/create.ts";

const signal = new AbortController().signal;

test("missingCodeSearch fails every call with the engine named", async () => {
  const code = missingCodeSearch("blink");
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
  assert.deepEqual([code.engine, code.effect], ["gecko", "read-only"]);
  assert.deepEqual(await code.specRefs("u", signal, 500), [{ group: "Code", path: "a.cpp", line: 500, url: "u" }]);
  assert.deepEqual(await code.functionAt("a.cpp", 1, signal), [{ symbol: "_Z1av", signature: "void a() {" }]);
  assert.equal(await code.file("a.cpp", signal), "text");
  assert.equal(await code.file("gone.cpp", signal), null);
  await assert.rejects(code.file("b.cpp", signal), /network unreachable/);
  assert.deepEqual(await code.tip(), { repoBase: "https://searchfox.org/mozilla-central/", rev: "abc" });
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
