import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { LlmPrompt, LlmService } from "../../src/runtime/llm/types.ts";
import type { DiffData, LlmSelection, PatchNarrativeData, ReviewFindingData } from "../../src/shared/types.ts";
import { review } from "../../src/tasks/review/task.ts";

const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
const diffData: DiffData = {
  baseSha: "b", headSha: "h", commits: [{ sha: "1", subject: "Bug 1 - Add flag", body: "" }],
  files: [{ path: "dom/A.cpp", status: "modified", binary: false, hunks: [
    { id: "f0h0", header: "@@ -10,2 +10,3 @@", oldStart: 10, oldLines: 2, newStart: 10, newLines: 3, lines: [
      { kind: "ctx", text: "  int a = 1;" }, { kind: "del", text: "  Old();" }, { kind: "add", text: "  mFlag = true;" }, { kind: "add", text: "  int a = 1;" },
    ] },
    { id: "f0h1", header: "@@ -40,0 +41 @@", oldStart: 40, oldLines: 0, newStart: 41, newLines: 1, lines: [{ kind: "add", text: "other();" }] },
  ] }],
};

function setup(replies: unknown[], repoMcp = false) {
  const store = new Store(":memory:");
  const calls: { prompt: LlmPrompt; selection?: LlmSelection }[] = [];
  let index = 0;
  const llm: LlmService = {
    defaultSelection: selection,
    run(selected, prompt) {
      calls.push({ prompt, selection: selected });
      return Promise.resolve({ text: "", json: replies[index++], providerSessionId: "p", selection: selected! });
    },
    async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
  };
  const rt = new Runtime({ store, tasks: [review], llm, git: () => ({}) as GitCapability, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability,
    sessionMcp: (sessionId) => ({ spatial: { type: "stdio", command: "node", args: ["server.ts", "--session", sessionId] } }),
    ...(repoMcp ? { repoContext: () => ({ mcpServers: { moz: { type: "http", url: "https://example.com/mcp" } } }) } : {}) });
  const session = store.createSession("/repo", "t");
  const diffId = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: diffData, provenance: { taskId: "x" } }).id;
  const narrativeId = store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data: {
    diffId, summary: "s", changes: [
      { id: "c1", title: "Add flag", explanation: "Adds mFlag.", rationale: "Because teardown.", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] },
      { id: "c2", title: "Other", explanation: "x", rationale: "y", hunkIds: ["f0h1"], dependsOn: [], specUrls: [] },
    ],
  } satisfies PatchNarrativeData, provenance: { taskId: "x" } }).id;
  store.putLink({ sessionId: session.id, from: narrativeId, to: diffId, kind: "derivedFrom" });
  const specId = store.putArtifact({ sessionId: session.id, type: "SpecReference", status: "verified", data: {
    url: "https://example.test", resolved: { spec: "Example", anchor: "one", title: "Bug 1 - Add flag", type: "dfn", url: "https://example.test", content: "Spec." }, geckoRefs: [],
  }, provenance: { taskId: "x" } }).id;
  store.putLink({ sessionId: session.id, from: specId, to: `${narrativeId}#c1`, kind: "supports" });
  const run = () => rt.run<{ findingIds: string[]; findingErrors: string[] }>(session.id, "review", { narrativeId });
  return { store, session, diffId, narrativeId, calls, run };
}

test("valid findings become artifacts with derived lines and links", async () => {
  const { store, session, diffId, narrativeId, calls, run } = setup([{ findings: [
    { anchor: "c1", quote: "mFlag  = true;", category: "correctness", severity: "high", title: "Flag never reset", body: "Body **one**." },
    { anchor: "f0h1", quote: null, category: "tests", severity: "low", title: "No test", body: "Add a WPT." },
  ] }]);
  const { findingIds, findingErrors } = await run();
  assert.deepEqual(findingErrors, []);
  const [a, b] = findingIds.map((id) => store.getArtifact<ReviewFindingData>(id));
  assert.equal(a.type, "ReviewFinding");
  assert.equal(a.status, "proposed");
  assert.deepEqual(a.data, { anchor: `${diffId}#f0h0`, quote: "mFlag  = true;", lines: { path: "dom/A.cpp", side: "new", start: 11, end: 11 }, category: "correctness", severity: "high", title: "Flag never reset", body: "Body **one**." });
  assert.deepEqual(b.data, { anchor: `${diffId}#f0h1`, category: "tests", severity: "low", title: "No test", body: "Add a WPT." });
  const links = store.listLinks(session.id);
  assert.ok(links.some((l) => l.from === a.id && l.to === narrativeId && l.kind === "derivedFrom"));
  assert.ok(links.some((l) => l.from === a.id && l.to === `${diffId}#f0h0` && l.kind === "about"));
  const p = calls[0].prompt;
  assert.equal(p.tools, "read-only");
  assert.equal(p.cwd, "/repo");
  assert.ok(p.mcpServers?.spatial);
  for (const s of ["### f0h0 dom/A.cpp", "+  mFlag = true;", "# Spec references", "Bug 1 - Add flag"]) assert.ok(p.prompt.includes(s), s);
});

test("review merges repo MCP servers with session MCP servers", async () => {
  const { calls, run, session } = setup([{ findings: [] }], true);
  await run();
  assert.deepEqual(calls[0].prompt.mcpServers, {
    spatial: { type: "stdio", command: "node", args: ["server.ts", "--session", session.id] },
    moz: { type: "http", url: "https://example.com/mcp" },
  });
});

test("a change anchor without quote stays on the change", async () => {
  const { narrativeId, store, run } = setup([{ findings: [{ anchor: "c2", quote: null, category: "style", severity: "low", title: "A", body: "x" }] }]);
  const out = await run();
  assert.deepEqual(out.findingErrors, []);
  assert.equal(store.getArtifact<ReviewFindingData>(out.findingIds[0]).data.anchor, `${narrativeId}#c2`);
});

test("a quote on a deleted line uses the old side", async () => {
  const { store, run } = setup([{ findings: [{ anchor: "f0h0", quote: "Old();", category: "correctness", severity: "high", title: "A", body: "x" }] }]);
  const out = await run();
  assert.deepEqual(store.getArtifact<ReviewFindingData>(out.findingIds[0]).data.lines, { path: "dom/A.cpp", side: "old", start: 11, end: 11 });
});

test("the first matching row wins", async () => {
  const { store, run } = setup([{ findings: [{ anchor: "f0h0", quote: "int a = 1;", category: "correctness", severity: "high", title: "A", body: "x" }] }]);
  const out = await run();
  assert.deepEqual(store.getArtifact<ReviewFindingData>(out.findingIds[0]).data.lines, { path: "dom/A.cpp", side: "new", start: 10, end: 10 });
});

test("invalid findings are reported, not stored", async () => {
  const { store, session, run } = setup([{ findings: [
    { anchor: "c9", quote: null, category: "style", severity: "low", title: "A", body: "x" },
    { anchor: "f0h0", quote: "nowhere()", category: "style", severity: "low", title: "B", body: "x" },
    { anchor: "f0h0", quote: "Old();\nmFlag", category: "style", severity: "low", title: "C", body: "x" },
    { anchor: "f0h0", quote: "  ", category: "style", severity: "low", title: "D", body: "x" },
  ] }]);
  const out = await run();
  assert.deepEqual(out, { findingIds: [], findingErrors: ["A: unknown anchor c9", "B: quote not found", "C: quote spans lines", "D: empty quote"] });
  assert.equal(store.listArtifacts(session.id, "ReviewFinding").length, 0);
});

test("zero findings succeed with empty output", async () => {
  const { run } = setup([{ findings: [] }]);
  assert.deepEqual(await run(), { findingIds: [], findingErrors: [] });
});

test("an unparsable reply fails the task", async () => {
  const { run } = setup([{ summary: "x" }]);
  await assert.rejects(run(), /Review reply is not valid JSON/);
});
