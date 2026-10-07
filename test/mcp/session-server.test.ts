import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Store } from "../../src/runtime/store.ts";
import { createSessionServer } from "../../src/mcp/session-server.ts";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeRepo } from "../helpers/git-fixture.ts";

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
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["get", "read_skill", "scm_branches", "scm_diff", "scm_file", "scm_log", "scm_merge_base", "scm_show", "scm_status", "search", "session_overview"]);
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

// REQUIRES_REAL_GIT
test("session MCP exposes bounded read-only SCM tools for its worktree", async () => {
  const repo = makeRepo();
  try {
    const first = repo.commit({ "a.txt": "one\n" }, "first commit");
    const second = repo.commit({ "a.txt": "two\n", "many.txt": Array.from({ length: 405 }, (_, index) => `line${index + 1}`).join("\n") + "\n" }, "second commit");
    const store = new Store(":memory:");
    const session = store.createSession({ worktree: repo.dir, repoDir: `${repo.dir}/.git`, title: "test" });
    const server = createSessionServer(store, session.id, repo.dir);
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const status = await client.callTool({ name: "scm_status", arguments: {} });
    assert.match(text(status), /main/);
    assert.match(text(status), /working tree clean/i);
    const branches = await client.callTool({ name: "scm_branches", arguments: {} });
    assert.match(text(branches), /main/);
    const log = await client.callTool({ name: "scm_log", arguments: { range: "HEAD", limit: 1 } });
    assert.match(text(log), new RegExp(`${second.slice(0, 12)} second commit`));
    assert.doesNotMatch(text(log), /first commit/);
    const base = await client.callTool({ name: "scm_merge_base", arguments: { a: first, b: second } });
    assert.equal(text(base), first);
    const shown = await client.callTool({ name: "scm_show", arguments: { rev: second } });
    assert.match(text(shown), /second commit/);
    const patch = await client.callTool({ name: "scm_diff", arguments: { rev: second } });
    assert.match(text(patch), /two/);
    const file = await client.callTool({ name: "scm_file", arguments: { rev: second, path: "a.txt", start: 1, end: 1 } });
    assert.equal(text(file), "1: two");
    const bounded = await client.callTool({ name: "scm_file", arguments: { rev: second, path: "many.txt" } });
    assert.match(text(bounded), /^1: line1\n2: line2/);
    assert.match(text(bounded), /400: line400\n\[more lines available; request from line 401\]$/);
    assert.equal((await client.callTool({ name: "scm_file", arguments: { rev: second, path: "a.txt", start: 2 } })).isError, true);
    assert.equal((await client.callTool({ name: "scm_file", arguments: { rev: second, path: "../a.txt" } })).isError, true);
    assert.equal((await client.callTool({ name: "scm_file", arguments: { rev: second, path: "/etc/passwd" } })).isError, true);
    assert.equal((await client.callTool({ name: "scm_diff", arguments: { rev: second, path: "../a.txt" } })).isError, true);
    assert.equal((await client.callTool({ name: "scm_file", arguments: { rev: second, path: "a.txt", start: 3, end: 2 } })).isError, true);
    assert.equal((await client.callTool({ name: "scm_diff", arguments: { rev: "--bad" } })).isError, true);
    assert.equal((await client.callTool({ name: "scm_file", arguments: { rev: "missing-revision", path: "a.txt" } })).isError, true);
    assert.match(text(shown), /a\.txt/);
    const unsafe = await client.callTool({ name: "scm_log", arguments: { range: "--all" } });
    assert.equal(unsafe.isError, true);
    await client.close();
    await server.close();
    store.close();
  } finally {
    rmSync(repo.dir, { recursive: true, force: true });
  }
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
