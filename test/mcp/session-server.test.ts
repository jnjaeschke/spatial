import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Store } from "../../src/runtime/store.ts";
import { createRepoServer, createSessionServer } from "../../src/mcp/session-server.ts";
import { pluginRegistry } from "../../src/runtime/plugins.ts";
import { plugins } from "../../src/plugins/index.ts";
import { corePlugin } from "../../src/runtime/create.ts";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeRepo } from "../helpers/git-fixture.ts";
import { z } from "zod";
import { defineMcpTool } from "../../src/runtime/plugins.ts";
import { sessionServerSpec } from "../../src/runtime/create.ts";
import { specTestServices } from "../helpers/spec-services.ts";
import { MAX_TOOL_OUTPUT } from "../../src/runtime/git.ts";
import { KnowledgeStore } from "../../src/runtime/knowledge.ts";
import type { CodeSearch } from "../../src/plugins/spec/runtime/code-search.ts";

const code = {} as CodeSearch;
const caps = { services: specTestServices({ codeSearch: { gecko: code, blink: code, webkit: code } }), knowledge: new KnowledgeStore(":memory:") };

const text = (result: Awaited<ReturnType<Client["callTool"]>>) => (result.content as { text: string }[])[0]!.text;
const registry = pluginRegistry([corePlugin, ...plugins]);

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
  const server = createSessionServer(registry, store, session.id, session.worktree, caps);
  const client = new Client({ name: "test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["code_read", "code_search", "get", "read_skill", "scm_blame", "scm_branches", "scm_diff", "scm_file", "scm_log", "scm_merge_base", "scm_range_diff", "scm_show", "scm_status", "search", "session_overview", "spec_effects", "spec_flow", "spec_impl", "spec_query", "spec_refs", "spec_state"]);
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
test("the repo MCP server exposes the repo tools only and answers for its repository", async () => {
  const repo = makeRepo();
  try {
    repo.commit({ "a.txt": "one\n" }, "only commit");
    const server = createRepoServer(repo.dir);
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), ["read_skill", "scm_blame", "scm_branches", "scm_diff", "scm_file", "scm_log", "scm_merge_base", "scm_range_diff", "scm_show", "scm_status"]);
    assert.match(text(await client.callTool({ name: "scm_log", arguments: { range: "HEAD", limit: 1 } })), /only commit/);
    await client.close();
    await server.close();
  } finally {
    rmSync(repo.dir, { recursive: true, force: true });
  }
});

// REQUIRES_REAL_GIT
test("session MCP exposes bounded read-only SCM tools for its worktree", async () => {
  const repo = makeRepo();
  try {
    const first = repo.commit({ "a.txt": "one\n" }, "first commit");
    const second = repo.commit({ "a.txt": "two\n", "many.txt": Array.from({ length: 405 }, (_, index) => `line${index + 1}`).join("\n") + "\n" }, "second commit");
    const store = new Store(":memory:");
    const session = store.createSession({ worktree: repo.dir, repoDir: `${repo.dir}/.git`, title: "test" });
    const server = createSessionServer(registry, store, session.id, repo.dir, caps);
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const status = await client.callTool({ name: "scm_status", arguments: {} });
    assert.match(text(status), /main/);
    assert.match(text(status), /working tree clean/i);
    const branches = await client.callTool({ name: "scm_branches", arguments: {} });
    assert.match(text(branches), /main/);
    const log = await client.callTool({ name: "scm_log", arguments: { range: "HEAD", limit: 1 } });
    assert.match(text(log), new RegExp(`^${second.slice(0, 12)} \\d{4}-\\d{2}-\\d{2} T: second commit$`));
    assert.doesNotMatch(text(log), /first commit/);
    const base = await client.callTool({ name: "scm_merge_base", arguments: { a: first, b: second } });
    assert.equal(text(base), first);
    const shown = await client.callTool({ name: "scm_show", arguments: { rev: second } });
    assert.match(text(shown), /second commit/);
    const patch = await client.callTool({ name: "scm_diff", arguments: { rev: second } });
    assert.match(text(patch), /two/);
    const range = await client.callTool({ name: "scm_range_diff", arguments: { a: first, b: second } });
    assert.match(text(range), /^diff --git a\/a\.txt b\/a\.txt/m);
    assert.match(text(range), /^-one$/m);
    assert.match(text(range), /^\+two$/m);
    assert.match(text(range), /many\.txt/);
    const rangePath = await client.callTool({ name: "scm_range_diff", arguments: { a: first, b: second, path: "a.txt" } });
    assert.doesNotMatch(text(rangePath), /many\.txt/);
    assert.equal((await client.callTool({ name: "scm_range_diff", arguments: { a: "--output=x", b: second } })).isError, true);
    assert.equal((await client.callTool({ name: "scm_range_diff", arguments: { a: first, b: second, path: "../a.txt" } })).isError, true);
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
    const touching = await client.callTool({ name: "scm_log", arguments: { range: "HEAD", path: "many.txt" } });
    assert.match(text(touching), /second commit/);
    assert.doesNotMatch(text(touching), /first commit/);
    const added = await client.callTool({ name: "scm_log", arguments: { range: "HEAD", search: "one" } });
    assert.match(text(added), /first commit/);
    assert.match(text(added), /second commit/);
    const matching = await client.callTool({ name: "scm_log", arguments: { range: "HEAD", regex: "^tw" } });
    assert.match(text(matching), /second commit/);
    assert.doesNotMatch(text(matching), /first commit/);
    const optionLike = await client.callTool({ name: "scm_log", arguments: { range: "HEAD", search: "--output=/tmp/x" } });
    assert.equal(optionLike.isError, undefined);
    assert.equal((await client.callTool({ name: "scm_log", arguments: { range: "HEAD", path: "../a.txt" } })).isError, true);
    const blame = await client.callTool({ name: "scm_blame", arguments: { rev: second, path: "many.txt", start: 2, end: 3 } });
    assert.match(text(blame), new RegExp(`^${second.slice(0, 12)} .*2: line2\n${second.slice(0, 12)} .*3: line3$`));
    assert.equal((await client.callTool({ name: "scm_blame", arguments: { rev: second, path: "../a.txt", start: 1, end: 1 } })).isError, true);
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
    const server = createSessionServer(registry, store, session.id, repo, caps);
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

const echo = (seen: unknown[], services: Readonly<Record<string, unknown>>) => defineMcpTool({
  name: "echo_ref", description: "Echo a ref", input: { ref: z.string() },
  async run(ctx, { ref }) {
    seen.push([ctx.sessionId, ctx.repo, ctx.services === services, ctx.signal instanceof AbortSignal]);
    if (ref === "bad") throw new Error("no such ref");
    return ref === "huge" ? "x".repeat(MAX_TOOL_OUTPUT + 1) : `got ${ref}`;
  },
});

test("plugin MCP tools are registered read-only, run with the session context and answer at most MAX_TOOL_OUTPUT characters", async () => {
  const store = new Store(":memory:");
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const seen: unknown[] = [];
  const services = { probe: {} };
  const server = createSessionServer(pluginRegistry([corePlugin, { id: "probe", mcpTools: [echo(seen, services)] }]), store, session.id, "/repo", { services, knowledge: new KnowledgeStore(":memory:") });
  const client = new Client({ name: "test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const tool = (await client.listTools()).tools.find((t) => t.name === "echo_ref")!;
  assert.equal(tool.annotations?.readOnlyHint, true);
  assert.equal(text(await client.callTool({ name: "echo_ref", arguments: { ref: "HTML#a" } })), "got HTML#a");
  const bad = await client.callTool({ name: "echo_ref", arguments: { ref: "bad" } });
  assert.equal(bad.isError, true);
  assert.equal(text(bad), "no such ref");
  assert.equal(text(await client.callTool({ name: "echo_ref", arguments: { ref: "huge" } })), `${"x".repeat(MAX_TOOL_OUTPUT)}\n[output truncated]`);
  assert.deepEqual(seen, [[session.id, "/repo", true, true], [session.id, "/repo", true, true], [session.id, "/repo", true, true]]);
  await client.close();
  await server.close();
  store.close();
});

test("pluginRegistry rejects duplicate MCP tool names", () => {
  const tool = echo([], {});
  assert.throws(() => pluginRegistry([{ id: "a", mcpTools: [tool] }, { id: "b", mcpTools: [tool] }]), /Duplicate MCP tool: echo_ref/);
});

test("the session server spec forwards the SPATIAL_*_BIN variables that are set", () => {
  const spec = (env: Record<string, string>) => {
    const saved = Object.fromEntries(Object.keys(process.env).filter((key) => /^SPATIAL_\w+_BIN$/.test(key)).map((key) => [key, process.env[key]]));
    for (const key of Object.keys(saved)) delete process.env[key];
    Object.assign(process.env, env);
    try {
      const out = sessionServerSpec("/d/db.sqlite", "S");
      if (out.type !== "stdio") throw new Error("Expected a stdio session server");
      return out;
    } finally {
      for (const key of Object.keys(env)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  };
  const none = spec({});
  assert.deepEqual(none.args.slice(1), ["--db", "/d/db.sqlite", "--session", "S"]);
  assert.deepEqual(none.env ?? {}, {});
  assert.deepEqual(spec({ SPATIAL_WEBSPEC_BIN: "/bin/ws", SPATIAL_CHROMIUM_SEARCH_BIN: "/bin/cs", SPATIAL_OTHER: "x" }).env, { SPATIAL_WEBSPEC_BIN: "/bin/ws", SPATIAL_CHROMIUM_SEARCH_BIN: "/bin/cs" });
});
