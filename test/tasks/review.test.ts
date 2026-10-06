import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { LlmPrompt, LlmService } from "../../src/runtime/llm/types.ts";
import type { DiffData, FindingVerdictData, LlmSelection, PatchNarrativeData, ReviewFindingData } from "../../src/shared/types.ts";
import { findingStates } from "../../src/shared/findings.ts";
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

function setup(replies: unknown[], repoMcp = false, repoPrompt = false) {
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
    ...(repoMcp || repoPrompt ? { repoContext: () => ({ mcpServers: { moz: { type: "http", url: "https://example.com/mcp" } }, requestableMcpServers: {},
      instructions: repoPrompt ? "Review by repo rules." : null,
      skills: repoPrompt ? [{ name: "review-skill", description: "Review changes." }] : [] }) } : {}) });
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
  const run = (id = narrativeId) => rt.run<{ findingIds: string[]; verdictIds: string[]; findingErrors: string[] }>(session.id, "review", { narrativeId: id, llm: selection });
  return { store, session, diffId, narrativeId, calls, run };
}

test("valid findings become artifacts with derived lines and links", async () => {
  const { store, session, diffId, narrativeId, calls, run } = setup([{ findings: [
    { anchor: "c1", quote: "mFlag  = true;", category: "correctness", severity: "high", title: "Flag never reset", body: "Body **one**." },
    { anchor: "f0h1", quote: null, category: "tests", severity: "low", title: "No test", body: "Add a WPT." },
  ], verdicts: [] }]);
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
  const { calls, run, session } = setup([{ findings: [], verdicts: [] }], true);
  await run();
  assert.deepEqual(calls[0].prompt.mcpServers, {
    spatial: { type: "stdio", command: "node", args: ["server.ts", "--session", session.id] },
    moz: { type: "http", url: "https://example.com/mcp" },
  });
});

test("review system prompt includes repo instructions and skill index", async () => {
  const { calls, run } = setup([{ findings: [], verdicts: [] }], false, true);
  await run();
  assert.ok(calls[0].prompt.system?.startsWith("Review by repo rules."));
  assert.match(calls[0].prompt.system!, /- review-skill: Review changes\./);
  assert.match(calls[0].prompt.system!, /read_skill\(name\)/);
});

test("a change anchor without quote stays on the change", async () => {
  const { narrativeId, store, run } = setup([{ findings: [{ anchor: "c2", quote: null, category: "style", severity: "low", title: "A", body: "x" }], verdicts: [] }]);
  const out = await run();
  assert.deepEqual(out.findingErrors, []);
  assert.equal(store.getArtifact<ReviewFindingData>(out.findingIds[0]).data.anchor, `${narrativeId}#c2`);
});

test("a quote on a deleted line uses the old side", async () => {
  const { store, run } = setup([{ findings: [{ anchor: "f0h0", quote: "Old();", category: "correctness", severity: "high", title: "A", body: "x" }], verdicts: [] }]);
  const out = await run();
  assert.deepEqual(store.getArtifact<ReviewFindingData>(out.findingIds[0]).data.lines, { path: "dom/A.cpp", side: "old", start: 11, end: 11 });
});

test("the first matching row wins", async () => {
  const { store, run } = setup([{ findings: [{ anchor: "f0h0", quote: "int a = 1;", category: "correctness", severity: "high", title: "A", body: "x" }], verdicts: [] }]);
  const out = await run();
  assert.deepEqual(store.getArtifact<ReviewFindingData>(out.findingIds[0]).data.lines, { path: "dom/A.cpp", side: "new", start: 10, end: 10 });
});

test("invalid findings are reported, not stored", async () => {
  const { store, session, run } = setup([{ findings: [
    { anchor: "c9", quote: null, category: "style", severity: "low", title: "A", body: "x" },
    { anchor: "f0h0", quote: "nowhere()", category: "style", severity: "low", title: "B", body: "x" },
    { anchor: "f0h0", quote: "Old();\nmFlag", category: "style", severity: "low", title: "C", body: "x" },
    { anchor: "f0h0", quote: "  ", category: "style", severity: "low", title: "D", body: "x" },
  ], verdicts: [] }]);
  const out = await run();
  assert.deepEqual(out, { findingIds: [], verdictIds: [], findingErrors: ["A: unknown anchor c9", "B: quote not found", "C: quote spans lines", "D: empty quote"] });
  assert.equal(store.listArtifacts(session.id, "ReviewFinding").length, 0);
});

test("zero findings succeed with empty output", async () => {
  const { run } = setup([{ findings: [], verdicts: [] }]);
  assert.deepEqual(await run(), { findingIds: [], verdictIds: [], findingErrors: [] });
});

test("an unparsable reply fails the task", async () => {
  const { run } = setup([{ summary: "x" }]);
  await assert.rejects(run(), /Review reply is not valid JSON/);
});

test("epoch two prompt includes carried prior states and only epoch two adds sections", async () => {
  const { store, session, diffId, narrativeId, calls, run } = setup([
    { findings: [
      { anchor: "c1", quote: "mFlag", category: "correctness", severity: "high", title: "Accepted finding", body: "Accepted body." },
      { anchor: "c2", quote: null, category: "style", severity: "low", title: "Dismissed finding", body: "Dismissed body." },
    ], verdicts: [] }, { findings: [], verdicts: [] },
  ]);
  const first = await run();
  const acceptedId = first.findingIds[0];
  const dismissedId = first.findingIds[1];
  store.putArtifact({ sessionId: session.id, type: "FindingDecision", status: "verified", data: { finding: acceptedId, decision: "accepted" }, provenance: { taskId: "x" } });
  store.putLink({ sessionId: session.id, from: store.listArtifacts(session.id, "FindingDecision").at(-1)!.id, to: acceptedId, kind: "about" });
  store.putArtifact({ sessionId: session.id, type: "FindingDecision", status: "verified", data: { finding: dismissedId, decision: "dismissed" }, provenance: { taskId: "x" } });
  store.putLink({ sessionId: session.id, from: store.listArtifacts(session.id, "FindingDecision").at(-1)!.id, to: dismissedId, kind: "about" });
  const comment = store.putArtifact({ sessionId: session.id, type: "ReviewComment", status: "verified", data: { finding: acceptedId, body: "Please add a regression test." }, provenance: { taskId: "x" } });
  store.putLink({ sessionId: session.id, from: comment.id, to: acceptedId, kind: "about" });
  const posted = store.putArtifact({ sessionId: session.id, type: "PostedComment", status: "verified", data: { comment: comment.id, revision: 7, diff: 2, inlineId: 9 }, provenance: { taskId: "x" } });
  store.putLink({ sessionId: session.id, from: posted.id, to: comment.id, kind: "about" });
  const diff2 = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: diffData, provenance: { taskId: "x" } });
  const narrative2 = store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data: { diffId: diff2.id, previous: narrativeId, summary: "update", changes: [{ id: "c1", title: "Updated", explanation: "x", rationale: "y", hunkIds: ["f0h0"], dependsOn: [], specUrls: [], status: "modified" }] }, provenance: { taskId: "x" } });
  store.putLink({ sessionId: session.id, from: narrative2.id, to: diff2.id, kind: "derivedFrom" });
  for (const id of [acceptedId, dismissedId]) {
    const carry = store.putArtifact({ sessionId: session.id, type: "FindingCarry", status: "verified", data: { finding: id, toDiff: diff2.id, hunkId: id === acceptedId ? "f0h0" : null, ...(id === acceptedId ? { lines: { path: "dom/A.cpp", side: "new", start: 11, end: 11 } } : {}) }, provenance: { taskId: "x" } });
    store.putLink({ sessionId: session.id, from: carry.id, to: id, kind: "about" });
  }
  await run(narrative2.id);
  assert.match(calls[1].prompt.prompt, /# Prior findings\n\nF1 \[accepted\]/);
  assert.match(calls[1].prompt.prompt, /Please add a regression test\./);
  assert.match(calls[1].prompt.prompt, /posted to D2/);
  assert.match(calls[1].prompt.prompt, /outdated/);
  assert.match(calls[1].prompt.prompt, /F2 \[dismissed\] Dismissed finding/);
  assert.match(calls[1].prompt.prompt, /# Change status[\s\S]*c1: modified/);
  assert.doesNotMatch(calls[0].prompt.prompt, /# Prior findings|# Change status/);
  assert.match(calls[1].prompt.system!, /dismissed finding must not come back/);
});

test("valid verdict is stored and changes finding state", async () => {
  const { store, session, diffId, narrativeId, run } = setup([
    { findings: [{ anchor: "c1", quote: null, category: "correctness", severity: "high", title: "Prior", body: "x" }], verdicts: [] },
    { findings: [], verdicts: [{ finding: "F1", verdict: "addressed", reason: "The code now handles it." }, { finding: "F1", verdict: "partially", reason: "duplicate" }] },
  ]);
  const first = await run();
  const priorId = first.findingIds[0];
  const decision = store.putArtifact({ sessionId: session.id, type: "FindingDecision", status: "verified", data: { finding: priorId, decision: "accepted" }, provenance: { taskId: "x" } });
  store.putLink({ sessionId: session.id, from: decision.id, to: priorId, kind: "about" });
  const diff2 = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: diffData, provenance: { taskId: "x" } });
  const narrative2 = store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data: { diffId: diff2.id, previous: narrativeId, summary: "update", changes: [] }, provenance: { taskId: "x" } });
  store.putLink({ sessionId: session.id, from: narrative2.id, to: diff2.id, kind: "derivedFrom" });
  const carry = store.putArtifact({ sessionId: session.id, type: "FindingCarry", status: "verified", data: { finding: priorId, toDiff: diff2.id, hunkId: "f0h0" }, provenance: { taskId: "x" } });
  store.putLink({ sessionId: session.id, from: carry.id, to: priorId, kind: "about" });
  const out = await run(narrative2.id);
  assert.deepEqual(out.findingErrors, ["verdict F1: duplicate"]);
  const verdict = store.getArtifact<FindingVerdictData>(out.verdictIds[0]);
  assert.equal(verdict.type, "FindingVerdict");
  assert.equal(verdict.status, "proposed");
  assert.ok(verdict.provenance.llm);
  assert.ok(store.listLinks(session.id).some((l) => l.from === verdict.id && l.to === priorId && l.kind === "about"));
  assert.ok(store.listLinks(session.id).some((l) => l.from === verdict.id && l.to === narrative2.id && l.kind === "derivedFrom"));
  assert.equal(findingStates({ artifacts: store.listArtifacts(session.id), links: store.listLinks(session.id) }, narrative2.id)[0].status, "addressed");
});

test("accepted prior findings require a verdict, but addressed findings are not re-judged", async () => {
  const { store, session, narrativeId, run } = setup([
    { findings: [{ anchor: "c1", quote: null, category: "correctness", severity: "high", title: "Prior", body: "x" }], verdicts: [] },
    { findings: [], verdicts: [] },
    { findings: [], verdicts: [] },
  ]);
  const first = await run();
  const priorId = first.findingIds[0];
  const decision = store.putArtifact({ sessionId: session.id, type: "FindingDecision", status: "verified", data: { finding: priorId, decision: "accepted" }, provenance: { taskId: "x" } });
  store.putLink({ sessionId: session.id, from: decision.id, to: priorId, kind: "about" });
  const addEpoch = (previous: string) => {
    const diff = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: diffData, provenance: { taskId: "x" } });
    const narrative = store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data: { diffId: diff.id, previous, summary: "update", changes: [] }, provenance: { taskId: "x" } });
    store.putLink({ sessionId: session.id, from: narrative.id, to: diff.id, kind: "derivedFrom" });
    const carry = store.putArtifact({ sessionId: session.id, type: "FindingCarry", status: "verified", data: { finding: priorId, toDiff: diff.id, hunkId: "f0h0" }, provenance: { taskId: "x" } });
    store.putLink({ sessionId: session.id, from: carry.id, to: priorId, kind: "about" });
    return { diff, narrative };
  };
  const epoch2 = addEpoch(narrativeId);
  const missing = await run(epoch2.narrative.id);
  assert.ok(missing.findingErrors.includes("no verdict for F1"));
  const verdict = store.putArtifact({ sessionId: session.id, type: "FindingVerdict", status: "proposed", data: { finding: priorId, verdict: "addressed", reason: "done" }, provenance: { taskId: "x" } });
  store.putLink({ sessionId: session.id, from: verdict.id, to: priorId, kind: "about" });
  store.putLink({ sessionId: session.id, from: verdict.id, to: epoch2.narrative.id, kind: "derivedFrom" });
  const epoch3 = addEpoch(epoch2.narrative.id);
  const addressed = await run(epoch3.narrative.id);
  assert.deepEqual(addressed.findingErrors, []);
  assert.deepEqual(addressed.verdictIds, []);
});

test("invalid verdict labels are reported and expected missing verdict is reported", async () => {
  const { store, session, narrativeId, run } = setup([
    { findings: [{ anchor: "c1", quote: null, category: "correctness", severity: "high", title: "Prior", body: "x" }], verdicts: [] },
    { findings: [], verdicts: [{ finding: "F1", verdict: "addressed", reason: "x" }, { finding: "F1", verdict: "partially", reason: "duplicate" }, { finding: "F9", verdict: "addressed", reason: "unknown" }] },
  ]);
  const first = await run(); const priorId = first.findingIds[0];
  store.putArtifact({ sessionId: session.id, type: "FindingDecision", status: "verified", data: { finding: priorId, decision: "dismissed" }, provenance: { taskId: "x" } });
  const dismissed = store.listArtifacts(session.id, "FindingDecision").at(-1)!;
  store.putLink({ sessionId: session.id, from: dismissed.id, to: priorId, kind: "about" });
  const diff2 = store.putArtifact({ sessionId: session.id, type: "Diff", status: "verified", data: diffData, provenance: { taskId: "x" } });
  const narrative2 = store.putArtifact({ sessionId: session.id, type: "PatchNarrative", status: "proposed", data: { diffId: diff2.id, previous: narrativeId, summary: "update", changes: [] }, provenance: { taskId: "x" } });
  store.putLink({ sessionId: session.id, from: narrative2.id, to: diff2.id, kind: "derivedFrom" });
  const carry = store.putArtifact({ sessionId: session.id, type: "FindingCarry", status: "verified", data: { finding: priorId, toDiff: diff2.id, hunkId: "f0h0" }, provenance: { taskId: "x" } });
  store.putLink({ sessionId: session.id, from: carry.id, to: priorId, kind: "about" });
  const out = await run(narrative2.id);
  assert.ok(out.findingErrors.some((e) => e.includes("verdict F1: unknown or not expected")));
  assert.ok(out.findingErrors.some((e) => e.includes("verdict F9: unknown or not expected")));
  assert.equal(out.verdictIds.length, 0);
  assert.equal(store.listArtifacts(session.id, "FindingVerdict").length, 0);
});

test("reply without verdicts is rejected", async () => {
  const { run } = setup([{ findings: [] }]);
  await assert.rejects(run(), /Review reply is not valid JSON/);
});
