import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCodeRefs } from "../../../src/plugins/spec/tasks/check-trace/task.ts";
import { missingCodeSearch } from "../../../src/runtime/code-search.ts";
import { fakeCode } from "./fake-code.ts";

const FILE = "int a;\nvoid Navigate() {\n  if (!doc) return;\n}";
const ref = (line: number, quote: string, path = "a.cc") => ({ engine: "gecko" as const, path, line, quote });

test("checkCodeRefs checks each reference's quote against the engine's file, reading each file and the revision once, and links the verified ones at the engine's revision", async () => {
  const { code, calls } = fakeCode({ "a.cc": FILE }, [], { engine: "gecko", repoBase: "https://sf/" });
  const codeSearch = { gecko: code, blink: missingCodeSearch("blink"), webkit: missingCodeSearch("webkit") };
  assert.deepEqual(await checkCodeRefs(codeSearch, [ref(3, "if (!doc) return;"), ref(2, "return"), ref(1, "x", "b.cc"), ref(3, "if (!doc)")], new AbortController().signal), [
    { ok: true, url: "https://sf/rev/r1/a.cc#3" }, { ok: false, reason: "a.cc:2 does not read `return`" }, { ok: false, reason: "b.cc does not exist" }, { ok: false, reason: "a.cc:3 does not read `if (!doc)`" },
  ]);
  assert.deepEqual(calls, ["file a.cc", "tip", "file b.cc"]);
  assert.deepEqual(await checkCodeRefs(codeSearch, [{ ...ref(3, "if (!doc) return;"), engine: "blink" }], new AbortController().signal), [{ ok: false, reason: "No blink code search configured" }]);
});
