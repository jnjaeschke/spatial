import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedSpec, SearchfoxCapability, WebspecCapability } from "../../../src/plugin-api.ts";
import { lookupSpec, resolveSpecReference } from "../../../src/plugins/spec/runtime/spec-ref.ts";

const spec: ResolvedSpec = { spec: "HTML", anchor: "a", title: "T", type: "dfn", url: "https://html.spec/#a", content: "c" };
const env = (resolve: WebspecCapability["resolve"], repo = "/nonexistent", specRefs: SearchfoxCapability["specRefs"] = async () => []) =>
  ({ webspec: { effect: "read-only", resolve, analyze: async () => [], lookup: async () => { throw new Error("not used"); }, query: async () => { throw new Error("not used"); }, search: async () => { throw new Error("not used"); }, refs: async () => { throw new Error("not used"); }, idl: async () => { throw new Error("not used"); }, effectPaths: async () => { throw new Error("not used"); } } as WebspecCapability, searchfox: { effect: "read-only", specRefs, tip: async () => ({ repoBase: "", rev: "" }) } as SearchfoxCapability, repo, signal: new AbortController().signal });

test("a found spec is a verified-style reference without Searchfox lookups outside Gecko", async () => {
  const data = await resolveSpecReference(env(async () => ({ found: true, spec })), "https://html.spec/#a", "llm");
  assert.deepEqual(data, { url: "https://html.spec/#a", resolved: spec, origin: "llm", geckoRefs: [] });
});

test("a not found or failing lookup is an unresolved reference with the reason", async () => {
  assert.deepEqual(await resolveSpecReference(env(async () => ({ found: false, reason: "no such spec" })), "u", "llm"), { url: "u", resolved: null, origin: "llm", reason: "no such spec", geckoRefs: [] });
  assert.deepEqual(await lookupSpec(env(async () => { throw new Error("panic"); }), "u"), { found: false, reason: "panic" });
});

test("a cancelled lookup rejects", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(lookupSpec({ ...env(async () => { throw new Error("aborted"); }), signal: controller.signal }, "u"), /aborted/);
});

test("in a Gecko repo the Searchfox references are added, and their failure is recorded", async () => {
  const repo = mkdtempSync(join(tmpdir(), "gecko-"));
  writeFileSync(join(repo, "mach"), "");
  writeFileSync(join(repo, "moz.build"), "");
  const refs = [{ group: "g", path: "p.cpp", line: 1, url: "u" }];
  assert.deepEqual((await resolveSpecReference(env(async () => ({ found: true, spec }), repo, async () => refs), "u", "code")).geckoRefs, refs);
  const failed = await resolveSpecReference(env(async () => ({ found: true, spec }), repo, async () => { throw new Error("searchfox down"); }), "u", "code");
  assert.deepEqual([failed.geckoRefs, failed.geckoRefsError], [[], "searchfox down"]);
});


test("lookupSpec turns a crashing lookup into not found, unless the task was cancelled", async () => {
  const webspec = { resolve: async () => { throw new Error("webspec-index exited with code 101: boom"); } } as never;
  assert.deepEqual(await lookupSpec({ webspec, signal: new AbortController().signal }, "u"), { found: false, reason: "webspec-index exited with code 101: boom" });
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(lookupSpec({ webspec, signal: aborted.signal }, "u"), /boom/);
});
