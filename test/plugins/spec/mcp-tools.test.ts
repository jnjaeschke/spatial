import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Store } from "../../../src/runtime/store.ts";
import { createSessionServer } from "../../../src/mcp/session-server.ts";
import { pluginRegistry } from "../../../src/runtime/plugins.ts";
import { corePlugin } from "../../../src/runtime/create.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import type { WebspecCapability, WebspecLookup } from "../../../src/runtime/tasks.ts";
import { KnowledgeStore } from "../../../src/runtime/knowledge.ts";
import type { CodeSearch } from "../../../src/runtime/code-search.ts";
import { mappingKey } from "../../../src/plugins/spec/shared/engine.ts";
import type { EngineMapping, EngineSite, EngineStep } from "../../../src/plugins/spec/shared/types.ts";

const FILES: Record<string, string> = { "a.cc": "one\ntwo\nthree\nfour", "nav.cc": "int x;\nvoid Navigate() {\n  Step();\n}" };
const code = { search: async (query: string) => query === "Navigate" ? [{ path: "a.cc", line: 3, snippet: "Navigate();" }] : [], file: async (path: string) => FILES[path] ?? null } as unknown as CodeSearch;
const site = (path: string, line: number, signature: string, method: EngineSite["method"], steps: EngineStep[] = []): EngineSite => ({ path, line, symbol: signature, signature, quote: signature, method, refs: [], steps });
const MAPPING: EngineMapping = { engine: "gecko", repoBase: "https://searchfox.org/mozilla-central/", rev: "r1", sites: [
  site("nav.cc", 1, "void Navigate() {", "spec-link", [{ step: "3", line: 2, end: 2, verdict: "match", detail: "Steps." }]),
  site("gone.cc", 5, "void Gone() {", "user"),
  site("a.cc", 1, "one", "llm"),
], tests: [], rejected: [], checkedAt: "2026-10-11T00:00:00.000Z" };

test("spec tools pass their arguments to webspec lookups and answer with the output", async () => {
  const requests: WebspecLookup[] = [];
  const webspec = { lookup: async (request: WebspecLookup) => { requests.push(request); return `text of ${request.command}`; } } as unknown as WebspecCapability;
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const knowledge = new KnowledgeStore(":memory:");
  knowledge.put("global", "spec", mappingKey("gecko", "HTML#navigate"), MAPPING, { by: "plugin", sessionId: session.id });
  knowledge.put("global", "spec", mappingKey("blink", "HTML#navigate"), null, { by: "user", sessionId: session.id });
  const server = createSessionServer(pluginRegistry([corePlugin, specPlugin]), store, session.id, "/repo", { webspec, knowledge, codeSearch: { gecko: code, blink: code, webkit: code } });
  const client = new Client({ name: "test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  assert.deepEqual((await client.listTools()).tools.map((t) => t.name).filter((name) => name.startsWith("spec_")).sort(), ["spec_effects", "spec_flow", "spec_impl", "spec_query", "spec_refs", "spec_state"]);
  const call = async (name: string, args: Record<string, unknown>) => ((await client.callTool({ name, arguments: args })).content as { text: string }[])[0]!.text;
  assert.equal(await call("spec_query", { ref: "HTML#navigate", steps: "8" }), "text of query");
  await call("spec_query", { ref: "HTML#navigate" });
  await call("spec_refs", { ref: "HTML#navigate", direction: "outgoing" });
  await call("spec_effects", { ref: "HTML#navigate", step: "8" });
  await call("spec_flow", { ref: "HTML#navigate" });
  assert.equal(await call("spec_state", { selector: "Document" }), "text of state");
  assert.equal(await call("spec_impl", { ref: "HTML#navigate", engine: "gecko" }), "The gecko mapping of HTML#navigate at the current revision (lines as code_read numbers them):\n- nav.cc:2 void Navigate() {\n  step 3: lines 3-3 (match)\n- gone.cc void Gone() { (not found at the current revision)");
  assert.equal(await call("spec_impl", { ref: "HTML#navigate", engine: "blink" }), "The blink mapping of HTML#navigate was rejected.");
  assert.equal(await call("spec_impl", { ref: "HTML#navigate", engine: "webkit" }), "No webkit mapping of HTML#navigate is stored.");
  assert.equal(await call("code_search", { engine: "gecko", query: "Navigate" }), "a.cc:3: Navigate();");
  assert.equal(await call("code_search", { engine: "gecko", query: "Nothing" }), "No matches.");
  assert.equal(await call("code_read", { engine: "gecko", path: "a.cc", start: 2, end: 3 }), "2: two\n3: three");
  for (const [name, args, error] of [["code_read", { engine: "gecko", path: "a.cc", start: 3, end: 2 }, "a.cc has lines 1-4; asked for 3-2"], ["code_read", { engine: "gecko", path: "a.cc", start: 9, end: 9 }, "a.cc has lines 1-4; asked for 9-9"]] as const) {
    const result = await client.callTool({ name, arguments: args });
    assert.deepEqual([result.isError, (result.content as { text: string }[])[0]!.text], [true, error]);
  }
  assert.equal((await client.callTool({ name: "code_search", arguments: { engine: "gecko", query: " " } })).isError, true);
  const missing = await client.callTool({ name: "code_read", arguments: { engine: "blink", path: "b.cc", start: 1, end: 2 } });
  assert.equal(missing.isError, true);
  assert.equal((missing.content as { text: string }[])[0]!.text, "blink has no file b.cc");
  assert.deepEqual(requests, [
    { command: "query", ref: "HTML#navigate", steps: "8" }, { command: "query", ref: "HTML#navigate", steps: null },
    { command: "refs", ref: "HTML#navigate", direction: "outgoing", limit: 20 }, { command: "effects", ref: "HTML#navigate", step: "8" },
    { command: "flow", ref: "HTML#navigate" }, { command: "state", selector: "Document" },
  ]);
  await client.close();
  await server.close();
  store.close();
});
