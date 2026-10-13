import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../../../src/runtime/store.ts";
import { Runtime, type GitCapability, type WebspecCapability, type SearchfoxCapability } from "../../../../src/runtime/tasks.ts";
import type { LlmPrompt, LlmService } from "../../../../src/runtime/llm/types.ts";
import type { DiffData, LlmSelection, PatchNarrativeData } from "../../../../src/shared/types.ts";
import { narrate, MAX_PROMPT_CHARS } from "../../../../src/plugins/review/tasks/narrate/task.ts";
import { renderDiffForPrompt } from "../../../../src/plugins/review/tasks/narrate/render.ts";
import { validateNarrative } from "../../../../src/plugins/review/tasks/narrate/validate.ts";
import schema from "../../../../src/plugins/review/tasks/narrate/schema.json" with { type: "json" };

const DIFF: DiffData = {
  baseSha: "b".repeat(40),
  headSha: "h".repeat(40),
  commits: [{ sha: "1".repeat(40), subject: "Bug 1 - Add flag", body: "Spec: https://html.spec.whatwg.org/#navigate" }],
  files: [
    { path: "dom/A.cpp", status: "modified", binary: false, hunks: [
      { id: "f0h0", header: "@@ -1,2 +1,2 @@ void A()", oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, lines: [{ kind: "ctx", text: "x" }, { kind: "del", text: "old" }, { kind: "add", text: "new" }] },
      { id: "f0h1", header: "@@ -9 +9 @@", oldStart: 9, oldLines: 1, newStart: 9, newLines: 1, lines: [{ kind: "add", text: "y" }] },
    ] },
    { path: "img.png", status: "added", binary: true, hunks: [] },
    { path: "test/t.html", status: "added", binary: false, hunks: [
      { id: "f2h0", header: "@@ -0,0 +1 @@", oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: [{ kind: "add", text: "<p>" }] },
    ] },
  ],
};

const change = (id: string, hunkIds: string[], dependsOn: string[] = []) => ({
  id, title: `T${id}`, explanation: "e", rationale: "r", hunkIds, dependsOn, specUrls: [],
});
const VALID = { summary: "S", changes: [change("c1", ["f0h0", "f0h1"]), change("c2", ["f2h0"], ["c1"])] };
const STACK: DiffData = {
  ...DIFF,
  commits: [
    { sha: "1".repeat(40), subject: "Part 1", body: "" },
    { sha: "2".repeat(40), subject: "Part 2", body: "Differential Revision: https://phab.example.com/D7" },
  ],
  files: [{ path: "dom/A.cpp", status: "modified", binary: false, hunks: [
    { id: "f0h0", header: "@@ -1 +1 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "add", text: "a", commit: 0 }] },
    { id: "f0h1", header: "@@ -2 +2 @@", oldStart: 2, oldLines: 1, newStart: 2, newLines: 1, lines: [{ kind: "add", text: "b", commit: 1 }] },
  ] }, { path: "dom/B.cpp", status: "added", binary: false, hunks: [
    { id: "f1h0", header: "@@ -0,0 +1 @@", oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: [{ kind: "add", text: "c", commit: 0 }] },
  ] }],
};

test("render: commits, labelled hunks with prefixes, binary files listed", () => {
  const s = renderDiffForPrompt(DIFF);
  assert.match(s, /Bug 1 - Add flag/);
  assert.match(s, /Spec: https:\/\/html\.spec\.whatwg\.org\/#navigate/);
  assert.match(s, /### f0h0 dom\/A\.cpp\n@@ -1,2 \+1,2 @@ void A\(\)\n x\n-old\n\+new/);
  assert.match(s, /### f2h0 test\/t\.html \(added\)/);
  assert.match(s, /img\.png \(added, binary\)/);
});

test("stack render labels commits and owned hunks only for stacks", () => {
  const stack = renderDiffForPrompt(STACK);
  for (const text of ["## C1: Part 1", "## C2: Part 2", "### f0h0 dom/A.cpp [C1]", "### f0h1 dom/A.cpp [C2]"]) assert.ok(stack.includes(text), text);
  const single = renderDiffForPrompt(DIFF);
  assert.doesNotMatch(single, /\[C1\]|## C1:/);
});

test("validate: valid narrative has no errors", () => {
  assert.deepEqual(validateNarrative(VALID, DIFF), []);
});

test("validate: dependencies must point to earlier changes", () => {
  assert.deepEqual(validateNarrative({ summary: "S", changes: [change("c1", ["f0h0", "f0h1"], ["c2"]), change("c2", ["f2h0"])] }, DIFF), ["Change c1 depends on c2, which is not listed before it"]);
  assert.ok(validateNarrative({ summary: "S", changes: [change("c1", ["f0h0"], ["c1"]), change("c2", ["f0h1"])] }, DIFF).some((item) => item.startsWith("Dependency cycle")));
});

test("validate: stack ownership, order, and commit intents", () => {
  const valid = { summary: "S", commitIntents: ["a", "b"], changes: [change("c1", ["f0h0"]), change("c2", ["f1h0"], ["c1"]), change("c3", ["f0h1"], ["c1"])] };
  assert.deepEqual(validateNarrative(valid, STACK), []);
  for (const intents of [undefined, ["a"], ["a", " "]]) {
    const result = validateNarrative({ ...valid, commitIntents: intents }, STACK);
    assert.ok(result.includes("commitIntents must hold one non-empty sentence per commit (2)"));
  }
  assert.deepEqual(validateNarrative({ ...valid, flowHints: ["how A runs", null] }, STACK), []);
  for (const hints of [["a"], [" ", null], [1, null], "a"]) {
    assert.ok(validateNarrative({ ...valid, flowHints: hints }, STACK).includes("flowHints must hold one phrase or null per commit (2)"), JSON.stringify(hints));
  }
  assert.ok(validateNarrative({ ...valid, changes: [change("c1", ["f0h0", "f0h1"]), ...valid.changes.slice(1)] }, STACK).includes("Change c1 mixes hunks of C1, C2; split it by commit"));
  const reversed = { ...valid, changes: [change("c1", ["f0h1"]), change("c2", ["f0h0"]), change("c3", ["f1h0"])] };
  assert.ok(validateNarrative(reversed, STACK).includes("Change c2 (C1) comes after a change of C2; order changes by commit"));
  assert.ok(validateNarrative({ ...valid, changes: [change("c1", ["f0h0"], ["c2"]), ...valid.changes.slice(1)] }, STACK).includes("Change c1 depends on c2, which is not listed before it"));
});

test("validate: coverage, duplicates, unknown ids, deps, cycles, shape", () => {
  const errs = validateNarrative({
    summary: "S",
    changes: [
      change("c1", ["f0h0", "f9h9"], ["c3"]),
      change("c2", ["f0h0"], ["c4"]),
      change("c3", [], ["c1"]),
      change("c4", ["f2h0"], ["c2"]),
    ],
  }, DIFF);
  assert.deepEqual(errs.sort(), [
    "Change c1 depends on c3, which is not listed before it",
    "Change c2 depends on c4, which is not listed before it",
    "Change c3 has no hunks",
    "Dependency cycle involving: c1, c3",
    "Dependency cycle involving: c2, c4",
    "Hunk f0h0 assigned to multiple changes: c1, c2",
    "Hunk f0h1 not assigned to any change",
    "Unknown hunk id f9h9 in change c1",
  ].sort());
  assert.deepEqual(validateNarrative({ summary: 1, changes: "x" }, DIFF), ["Narrative must be an object with string summary and array changes"]);
  assert.deepEqual(validateNarrative({ summary: "S", changes: [change("c1", ["f0h0", "f0h1", "f2h0"]), change("c1", [])] }, DIFF).sort(), [
    "Change c1 has no hunks",
    "Duplicate change id c1",
  ]);
  assert.deepEqual(validateNarrative({ summary: "S", changes: [change("c1", ["f0h0", "f0h1", "f2h0"], ["c2"])] }, DIFF), ["Change c1 depends on unknown change c2"]);
});

test("validate: optionally allows unassigned hunks but still rejects duplicates", () => {
  const missing = { summary: "S", changes: [change("c1", ["f0h0", "f2h0"])] };
  assert.deepEqual(validateNarrative(missing, DIFF, { allowUnassigned: true }), []);
  assert.deepEqual(validateNarrative(missing, DIFF), ["Hunk f0h1 not assigned to any change"]);

  const duplicate = { summary: "S", changes: [change("c1", ["f0h0", "f0h1"]), change("c2", ["f0h0", "f2h0"])] };
  assert.ok(validateNarrative(duplicate, DIFF, { allowUnassigned: true }).includes("Hunk f0h0 assigned to multiple changes: c1, c2"));
});

function setup(responses: unknown[]) {
  const store = new Store(":memory:");
  const prompts: LlmPrompt[] = [];
  const sel: LlmSelection = { backend: "codex", model: "gpt-6-luna", effort: "medium" };
  const llm: LlmService = {
    defaultSelection: { backend: "claude", model: "m", effort: "low" },
    async run(selection, prompt) {
      prompts.push(prompt);
      if (responses.length === 0) throw new Error("no more responses");
      return { text: "", json: responses.shift(), providerSessionId: "p", selection: selection ?? sel };
    },
    async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
  };
  const rt = new Runtime({ store, plugins: [{ id: "test", tasks: [narrate] }], llm, git: () => ({}) as GitCapability, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const diffId = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: DIFF, provenance: { taskId: "x" } }).id;
  return { store, rt, session, diffId, prompts, sel };
}

test("narrate: stores proposed PatchNarrative with provenance and derivedFrom link", async () => {
  const { store, rt, session, diffId, prompts, sel } = setup([VALID]);
  const { narrativeId } = await rt.run<{ narrativeId: string }>(session.id, "narrate", { diffId, llm: sel });
  const a = store.getArtifact<PatchNarrativeData>(narrativeId);
  assert.equal(a.type, "PatchNarrative");
  assert.equal(a.status, "proposed");
  assert.deepEqual(a.data, { diffId, ...VALID });
  assert.ok(a.data.changes.every((item) => (item as { status?: string }).status === undefined));
  assert.deepEqual(a.provenance.llm, sel);
  assert.deepEqual(store.listLinks(session.id).map((l) => [l.from, l.to, l.kind]), [[narrativeId, diffId, "derivedFrom"]]);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].tools, "read-only");
  assert.deepEqual(prompts[0].mcpServers, {});
  assert.match(prompts[0].system!, /exactly one change/);
  assert.match(prompts[0].system!, /Only changes listed before this one/);
  assert.deepEqual(prompts[0].schema, schema);
  assert.doesNotMatch(prompts[0].system!, /stack of several commits/);
  assert.equal(prompts[0].prompt, renderDiffForPrompt(DIFF));
  assert.doesNotMatch(prompts[0].prompt, /# Previous narrative|# Interdiff|\[unchanged\]|\[modified\]|\[new\]/);
});

test("narrate stack: adds stack prompt and schema and stores commit intents and flow hints", async () => {
  const narrative = { summary: "S", commitIntents: ["First.", "Second."], flowHints: ["how A runs", null], changes: [change("c1", ["f0h0"]), change("c2", ["f1h0"], ["c1"]), change("c3", ["f0h1"], ["c1"])] };
  const { store, rt, session, prompts } = setup([narrative]);
  const diffId = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: STACK, provenance: { taskId: "x" } }).id;
  const { narrativeId } = await rt.run<{ narrativeId: string }>(session.id, "narrate", { diffId });
  assert.match(prompts[0].system!, /stack of several commits/);
  assert.deepEqual((prompts[0].schema as { required: string[] }).required, [...(schema as { required: string[] }).required, "commitIntents", "flowHints"]);
  assert.deepEqual(store.getArtifact<PatchNarrativeData>(narrativeId).data.commitIntents, narrative.commitIntents);
  assert.deepEqual(store.getArtifact<PatchNarrativeData>(narrativeId).data.flowHints, narrative.flowHints);
});

test("narrate: passes session and repo MCP servers with read-only tools", async () => {
  const store = new Store(":memory:");
  const prompts: LlmPrompt[] = [];
  const llm: LlmService = {
    defaultSelection: { backend: "claude", model: "m", effort: "low" },
    async run(selection, prompt) {
      prompts.push(prompt);
      return { text: "", json: VALID, providerSessionId: "p", selection: selection ?? this.defaultSelection };
    },
    async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
  };
  const rt = new Runtime({
    store, plugins: [{ id: "test", tasks: [narrate] }], llm, git: () => ({}) as GitCapability,
    webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability,
    sessionMcp: () => ({ spatial: { type: "stdio", command: "node", args: ["session-server"] } }),
    repoContext: () => ({ mcpServers: { moz: { type: "http", url: "https://example.com/mcp" } }, requestableMcpServers: {},
      skills: [{ name: "narrate-skill", description: "Group changes." }], instructions: "Follow narration rules." }),
  });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const diffId = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: DIFF, provenance: { taskId: "x" } }).id;
  await rt.run(session.id, "narrate", { diffId });
  assert.equal(prompts[0].tools, "read-only");
  assert.ok(prompts[0].system?.startsWith("Follow narration rules."));
  assert.match(prompts[0].system!, /- narrate-skill: Group changes\./);
  assert.match(prompts[0].system!, /read_skill\(name\)/);
  assert.deepEqual(prompts[0].mcpServers, {
    spatial: { type: "stdio", command: "node", args: ["session-server"] },
    moz: { type: "http", url: "https://example.com/mcp" },
  });
});

test("narrate: retries once with validation errors, then succeeds", async () => {
  const bad = { summary: "S", changes: [change("c1", ["f0h0"])] };
  const { rt, session, diffId, prompts } = setup([bad, VALID]);
  await rt.run(session.id, "narrate", { diffId });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1].prompt, /previous answer was invalid/);
  assert.match(prompts[1].prompt, /Hunk f0h1 not assigned to any change/);
  assert.match(prompts[1].prompt, /"c1"/);
});

test("narrate: fails after second invalid answer", async () => {
  const bad = { summary: "S", changes: [change("c1", ["f0h0", "f0h1"]), change("c2", ["f0h0", "f2h0"])] };
  const { rt, session, diffId, prompts } = setup([bad, bad]);
  await assert.rejects(rt.run(session.id, "narrate", { diffId }), /Narrative failed validation:[\s\S]*Hunk f0h0 assigned to multiple changes/);
  assert.equal(prompts.length, 2);
});

test("narrate: accepts unassigned hunks after the repair retry", async () => {
  const partial = { summary: "S", changes: [change("c1", ["f0h0", "f2h0"])] };
  const { store, rt, session, diffId, prompts } = setup([partial, partial]);
  const { narrativeId } = await rt.run<{ narrativeId: string }>(session.id, "narrate", { diffId });
  assert.deepEqual(store.getArtifact<PatchNarrativeData>(narrativeId).data.changes, [change("c1", ["f0h0", "f2h0"])]);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1].prompt, /Hunk f0h1 not assigned to any change/);
});

test("narrate: still rejects duplicate assignments after the repair retry", async () => {
  const duplicate = { summary: "S", changes: [change("c1", ["f0h0", "f0h1"]), change("c2", ["f0h0", "f2h0"])] };
  const { rt, session, diffId } = setup([duplicate, duplicate]);
  await assert.rejects(rt.run(session.id, "narrate", { diffId }), /Narrative failed validation:[\s\S]*Hunk f0h0 assigned to multiple changes/);
});

test("narrate: rejects oversized diffs before calling the LLM", async () => {
  const { store, rt, session, prompts } = setup([VALID]);
  const huge: DiffData = { ...DIFF, files: [{ path: "big.txt", status: "added", binary: false, hunks: [
    { id: "f0h0", header: "@@ -0,0 +1 @@", oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: [{ kind: "add", text: "x".repeat(MAX_PROMPT_CHARS) }] },
  ] }] };
  const diffId = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: huge, provenance: { taskId: "x" } }).id;
  await assert.rejects(rt.run(session.id, "narrate", { diffId }), /Diff too large for narration: \d+ chars \(limit 300000\)/);
  assert.equal(prompts.length, 0);
});

test("narrate: wrong artifact type is an error", async () => {
  const { store, rt, session } = setup([VALID]);
  const other = store.putArtifact({ sessionId: session.id, type: "Other", status: "verified", data: {}, provenance: { taskId: "x" } }).id;
  await assert.rejects(rt.run(session.id, "narrate", { diffId: other }), /is not a Diff/);
});

test("narrate update mode: renders prior narrative and interdiff, and computes statuses", async () => {
  const { store, rt, session, prompts } = setup([{ ...VALID, changes: VALID.changes.map((item) => ({ ...item, status: "bogus" })) }]);
  const previousData = { ...DIFF, files: DIFF.files.filter((file) => file.path !== "test/t.html") };
  const previousDiff = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: previousData, provenance: { taskId: "x" } });
  const previousNarrative = store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data: { diffId: previousDiff.id, summary: "Previous", changes: [change("c1", ["f0h0"])] }, provenance: { taskId: "x" } });
  const nextDiff = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: DIFF, provenance: { taskId: "x" } });
  const interdiff = store.putArtifact({ sessionId: session.id, type: "Interdiff", status: "verified", data: {
    fromDiff: previousDiff.id, toDiff: nextDiff.id, conflicts: [], files: [{ path: "dom/A.cpp", status: "modified", binary: false, hunks: [
      { id: "f0h0", header: "@@ -1 +1 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "del", text: "old" }, { kind: "add", text: "new" }] },
    ] }, { path: "test/t.html", status: "added", binary: false, hunks: [
      { id: "f1h0", header: "@@ -0,0 +1 @@", oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: [{ kind: "add", text: "<p>" }] },
    ] }],
  }, provenance: { taskId: "x" } });
  const { narrativeId } = await rt.run<{ narrativeId: string }>(session.id, "narrate", { diffId: nextDiff.id, update: { previousNarrativeId: previousNarrative.id, interdiffId: interdiff.id } });
  const narrative = store.getArtifact<PatchNarrativeData>(narrativeId);
  assert.equal(narrative.data.previous, previousNarrative.id);
  assert.deepEqual(narrative.data.changes.map((item) => item.status), ["modified", "new"]);
  for (const section of ["# Previous narrative", "# Interdiff", "I-f0h0", "[modified]", "[unchanged]", "[new]"]) assert.ok(prompts[0].prompt.includes(section), section);
  assert.ok(prompts[0].system?.includes("Describe what changed since the previous revision"));
  assert.ok(prompts[0].system?.includes("Only changes listed before this one"));
});

test("narrate update mode rejects an interdiff that does not connect", async () => {
  const { store, rt, session } = setup([VALID]);
  const other = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: DIFF, provenance: { taskId: "x" } });
  const previousNarrative = store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data: { diffId: other.id, summary: "Previous", changes: [] }, provenance: { taskId: "x" } });
  const nextDiff = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: DIFF, provenance: { taskId: "x" } });
  const interdiff = store.putArtifact({ sessionId: session.id, type: "Interdiff", status: "verified", data: { fromDiff: other.id, toDiff: other.id, conflicts: [], files: [] }, provenance: { taskId: "x" } });
  await assert.rejects(rt.run(session.id, "narrate", { diffId: nextDiff.id, update: { previousNarrativeId: previousNarrative.id, interdiffId: interdiff.id } }), /does not connect/);
});
