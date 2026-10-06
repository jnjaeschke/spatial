import { test } from "node:test";
import assert from "node:assert/strict";
import { renderRef, searchDocs, sessionOverview, type SessionView } from "../../src/runtime/render-ref.ts";
import type { Artifact, Link } from "../../src/shared/types.ts";

const artifact = <T,>(id: string, type: string, data: T): Artifact<T> => ({
  id, sessionId: "s", type, data, status: "proposed", provenance: { taskId: "task" }, createdAt: "now",
});

const hunk = (id: string) => ({ id, header: "@@ -1 +1 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: "add" as const, text: `line ${id}` }] });
const diff = artifact("D", "Diff", {
  baseSha: "base", headSha: "head", commits: [{ sha: "sha", subject: "Fix parser", body: "Commit body" }],
  files: [{ path: "src/a.ts", status: "modified" as const, binary: false, hunks: [hunk("f0h0"), hunk("f0h1")] }],
});
const narrative = artifact("N", "PatchNarrative", {
  diffId: "D", summary: "Overall summary", changes: [
    { id: "c1", title: "First change", explanation: "First explanation", rationale: "First rationale", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] },
    { id: "c2", title: "Second change", explanation: "Second explanation", rationale: "Second rationale", hunkIds: ["f0h1"], dependsOn: ["c1"], specUrls: [] },
  ],
});
const spec = artifact("R", "SpecReference", {
  url: "https://example.test/spec#section", resolved: { spec: "Example", anchor: "section", title: "Section title", type: "dfn", url: "https://example.test/spec#section", content: "Full section content" },
  origin: "code" as const, geckoRefs: [],
});
const thread = artifact("T", "ChatThread", { anchor: "N#c1" });
const finding = artifact("F", "ReviewFinding", { anchor: "D#f0h0", quote: "line f0h0", lines: { path: "src/a.ts", side: "new", start: 1, end: 1 }, category: "correctness", severity: "high", title: "Check parser", body: "This is a finding body." });
const otherFinding = artifact("F2", "ReviewFinding", { anchor: "D#f0h1", category: "style", severity: "low", title: "Old finding", body: "Old." });
const findingThread = artifact("FT", "ChatThread", { anchor: "F" });
const user = artifact("U", "ChatMessage", { role: "user" as const, text: "Why this change?" });
const assistant = artifact("A", "ChatMessage", { role: "assistant" as const, text: "It fixes the parser." });
const view: SessionView = {
  artifacts: [diff, narrative, spec, thread, user, assistant, finding, otherFinding, findingThread],
  links: [
    { id: "l1", sessionId: "s", from: "R", to: "N#c2", kind: "supports" },
    { id: "l2", sessionId: "s", from: "U", to: "T", kind: "reply" },
    { id: "l3", sessionId: "s", from: "A", to: "T", kind: "reply" },
    { id: "l4", sessionId: "s", from: "F", to: "N", kind: "derivedFrom" },
    { id: "l5", sessionId: "s", from: "F", to: "D#f0h0", kind: "about" },
    { id: "l6", sessionId: "s", from: "F2", to: "old-narrative", kind: "derivedFrom" },
  ] as Link[],
};

test("renderRef renders artifacts and supported subrefs", () => {
  assert.match(renderRef(view, "N"), /Overall summary/);
  assert.match(renderRef(view, "N"), /N#c1.*First change/s);
  const change = renderRef(view, "N#c2");
  assert.match(change, /Second explanation/);
  assert.match(change, /Second rationale/);
  assert.match(change, /line f0h1/);
  assert.ok(change.includes("Spec R") && change.includes("Section title"));
  assert.match(renderRef(view, "D"), /Fix parser/);
  assert.match(renderRef(view, "D"), /src\/a.ts/);
  assert.match(renderRef(view, "D#f0h0"), /line f0h0/);
  assert.match(renderRef(view, "D#f0h0"), /First change/);
  const renderedSpec = renderRef(view, "R");
  assert.match(renderedSpec, /Section title/);
  assert.match(renderedSpec, /Full section content/);
  assert.ok(renderedSpec.includes("N#c2"));
  const renderedThread = renderRef(view, "T");
  assert.match(renderedThread, /N#c1/);
  assert.match(renderedThread, /User: Why this change\?/);
  assert.match(renderedThread, /Assistant: It fixes the parser\./);
  assert.match(renderRef(view, "U"), /Why this change\?/);
  const renderedFinding = renderRef(view, "F");
  for (const expected of ["# Finding F: Check parser", "Category: correctness, severity: high", "Anchor: D#f0h0", "> line f0h0", "This is a finding body."]) assert.ok(renderedFinding.includes(expected), expected);
  assert.match(renderRef(view, "FT"), /Anchor: F/);
  assert.deepEqual(searchDocs(view, finding), [{ ref: "F", kind: "finding", body: "Check parser\nThis is a finding body." }]);
  assert.throws(() => renderRef(view, "N#nope"), /Unknown ref: N#nope/);
});

test("sessionOverview lists latest narrative changes, specs, and threads", () => {
  const overview = sessionOverview(view);
  for (const expected of ["N#c1", "N#c2", "f0h0", "f0h1", "R", "T"]) assert.ok(overview.includes(expected));
  assert.ok(overview.includes("# Findings"));
  assert.ok(overview.includes("- F [high correctness] Check parser (D#f0h0)"));
  assert.ok(!overview.includes("Old finding"));
});

test("sessionOverview reports no narrative when the latest Diff is not narrated", () => {
  const oldDiff = { ...diff, id: "D1" };
  const oldNarrative = { ...narrative, id: "N1", data: { ...narrative.data, diffId: "D1" } };
  const newDiff = { ...diff, id: "D2", data: { ...diff.data, headSha: "head2" } };
  assert.equal(sessionOverview({ artifacts: [oldDiff, oldNarrative, newDiff], links: [] }), "No narrative yet.");
});

test("sessionOverview lists carried findings and marks outdated locations", () => {
  const oldDiff = { ...diff, id: "D1", createdAt: "1" };
  const oldNarrative = { ...narrative, id: "N1", createdAt: "2", data: { ...narrative.data, diffId: "D1" } };
  const newDiff = { ...diff, id: "D2", createdAt: "3" };
  const newNarrative = { ...narrative, id: "N2", createdAt: "4", data: { ...narrative.data, diffId: "D2" } };
  const carry = artifact("FC", "FindingCarry", { finding: "F", toDiff: "D2", hunkId: null });
  const state = { artifacts: [oldDiff, oldNarrative, newDiff, newNarrative, finding, carry], links: [
    { id: "f-n1", sessionId: "s", from: "F", to: "N1", kind: "derivedFrom" },
    { id: "f-d1", sessionId: "s", from: "F", to: "D1#f0h0", kind: "about" },
    { id: "carry-f", sessionId: "s", from: "FC", to: "F", kind: "about" },
  ] as Link[] };
  const overview = sessionOverview(state);
  assert.match(overview, /- F \[high correctness\] Check parser \(location outdated\)/);
});

test("Phabricator comments render, search, and appear in session overview", () => {
  const root = artifact("PC", "PhabComment", { revision: 1, phid: "PHID-XCMT-1", version: 2, author: "alice", body: "updated root", path: "a.txt", line: 30, length: 1, diffId: 1, isNewFile: true, own: false, done: true, txId: 10, dateCreated: 10 });
  const old = artifact("PC0", "PhabComment", { ...root.data, version: 1, body: "old root", done: false, txId: 8 });
  const reply = artifact("PCR", "PhabComment", { ...root.data, phid: "PHID-XCMT-2", version: 1, body: "reply", replyTo: "PHID-XCMT-1", done: false, txId: 11 });
  const state: SessionView = { artifacts: [diff, narrative, old, root, reply], links: [] };
  const rendered = renderRef(state, "PC");
  for (const expected of ["@alice", "D1", "a.txt:30 (new side", "Done: yes", "updated root", "Reply by @alice: reply"]) assert.ok(rendered.includes(expected), expected);
  assert.match(renderRef(state, "PCR"), /updated root/);
  assert.deepEqual(searchDocs(state, root), [{ ref: "PC", kind: "comment", body: "@alice a.txt\nupdated root" }]);
  assert.deepEqual(searchDocs(state, old), []);
  assert.match(sessionOverview(state), /# Remote comments[\s\S]*- PC @alice \(a.txt:30\), done : updated root/);
  assert.ok(!sessionOverview({ artifacts: [diff, narrative], links: [] }).includes("# Remote comments"));
});
