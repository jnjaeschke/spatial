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

test("spec tools pass their arguments to webspec lookups and answer with the output", async () => {
  const requests: WebspecLookup[] = [];
  const webspec = { lookup: async (request: WebspecLookup) => { requests.push(request); return `text of ${request.command}`; } } as unknown as WebspecCapability;
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const server = createSessionServer(pluginRegistry([corePlugin, specPlugin]), store, session.id, "/repo", { webspec });
  const client = new Client({ name: "test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  assert.deepEqual((await client.listTools()).tools.map((t) => t.name).filter((name) => name.startsWith("spec_")).sort(), ["spec_effects", "spec_flow", "spec_query", "spec_refs", "spec_state"]);
  const call = async (name: string, args: Record<string, unknown>) => ((await client.callTool({ name, arguments: args })).content as { text: string }[])[0]!.text;
  assert.equal(await call("spec_query", { ref: "HTML#navigate", steps: "8" }), "text of query");
  await call("spec_query", { ref: "HTML#navigate" });
  await call("spec_refs", { ref: "HTML#navigate", direction: "outgoing" });
  await call("spec_effects", { ref: "HTML#navigate", step: "8" });
  await call("spec_flow", { ref: "HTML#navigate" });
  assert.equal(await call("spec_state", { selector: "Document" }), "text of state");
  assert.deepEqual(requests, [
    { command: "query", ref: "HTML#navigate", steps: "8" }, { command: "query", ref: "HTML#navigate", steps: null },
    { command: "refs", ref: "HTML#navigate", direction: "outgoing", limit: 20 }, { command: "effects", ref: "HTML#navigate", step: "8" },
    { command: "flow", ref: "HTML#navigate" }, { command: "state", selector: "Document" },
  ]);
  await client.close();
  await server.close();
  store.close();
});
