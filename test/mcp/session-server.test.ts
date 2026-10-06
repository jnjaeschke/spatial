import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Store } from "../../src/runtime/store.ts";
import { createSessionServer } from "../../src/mcp/session-server.ts";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const text = (result: Awaited<ReturnType<Client["callTool"]>>) => (result.content as { text: string }[])[0]!.text;

test("session MCP exposes live read-only overview, get, and search", async () => {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "test" });
  const diff = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", provenance: { taskId: "t" }, data: {
    baseSha: "b", headSha: "h", commits: [], files: [],
  } });
  const narrative = store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "verified", provenance: { taskId: "t" }, data: {
    diffId: diff.id, summary: "Summary", changes: [{ id: "c1", title: "Add useful thing", explanation: "Useful explanation", rationale: "Because", hunkIds: [], dependsOn: [], specUrls: [] }],
  } });
  store.putSearchDocs(session.id, narrative.id, [{ ref: `${narrative.id}#c1`, kind: "change", body: "Add useful thing\nUseful explanation" }]);
  const server = createSessionServer(store, session.id, session.worktree);
  const client = new Client({ name: "test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["get", "read_skill", "search", "session_overview"]);
  assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint === true));
  const got = await client.callTool({ name: "get", arguments: { ref: `${narrative.id}#c1` } });
  assert.match(text(got), /Useful explanation/);
  const searched = await client.callTool({ name: "search", arguments: { query: "useful" } });
  assert.match(text(searched), new RegExp(`${narrative.id}#c1`));
  const invalid = await client.callTool({ name: "search", arguments: { query: 'foo("' } });
  assert.equal(invalid.isError, true);
  assert.match(text(invalid), /Invalid search query/);
  const unknown = await client.callTool({ name: "get", arguments: { ref: "nope#x" } });
  assert.equal(unknown.isError, true);
  assert.match(text(unknown), /Unknown ref: nope#x/);
  const newArtifact = store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "verified", provenance: { taskId: "t" }, data: {
    diffId: diff.id, summary: "Later", changes: [{ id: "c2", title: "Live update token", explanation: "found", rationale: "r", hunkIds: [], dependsOn: [], specUrls: [] }],
  } });
  store.putSearchDocs(session.id, newArtifact.id, [{ ref: `${newArtifact.id}#c2`, kind: "change", body: "Live update token" }]);
  const live = await client.callTool({ name: "search", arguments: { query: "token" } });
  assert.match(text(live), new RegExp(newArtifact.id));
  await client.close();
  await server.close();
  store.close();
});

test("read_skill returns indexed skill content and rejects unindexed names", async () => {
  const repo = mkdtempSync(join(tmpdir(), "spatial-skills-"));
  try {
    mkdirSync(join(repo, ".agents", "skills", "foo"), { recursive: true });
    writeFileSync(join(repo, ".agents", "skills", "foo", "SKILL.md"), "---\nname: foo\ndescription: Example skill\n---\nDo the thing.\n");
    writeFileSync(join(repo, "outside.md"), "outside secret");
    const store = new Store(":memory:");
    const session = store.createSession({ worktree: repo, repoDir: `${repo}/.git`, title: "test" });
    const server = createSessionServer(store, session.id, repo);
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const skill = await client.callTool({ name: "read_skill", arguments: { name: "foo" } });
    assert.match(text(skill), /Do the thing\./);
    const missing = await client.callTool({ name: "read_skill", arguments: { name: "missing" } });
    assert.equal(missing.isError, true);
    const traversal = await client.callTool({ name: "read_skill", arguments: { name: ".." } });
    assert.equal(traversal.isError, true);
    assert.doesNotMatch(text(traversal), /outside secret/);
    await client.close();
    await server.close();
    store.close();
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
