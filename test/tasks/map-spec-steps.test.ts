import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../../src/runtime/store.ts";
import { Runtime, type GitCapability, type SearchfoxCapability, type WebspecCapability } from "../../src/runtime/tasks.ts";
import type { DiffData, LlmSelection, PatchNarrativeData, SpecReferenceData, SpecStepMapData } from "../../src/shared/types.ts";
import type { LlmPrompt, LlmService } from "../../src/runtime/llm/types.ts";
import { mappableSpecs, mapSpecSteps } from "../../src/tasks/map-spec-steps/task.ts";

const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
const STEPS = "To navigate:\n\n1. Fire *navigate*.\n2. If the commit is pending:\n\n    1. Defer the event.\n3. Fire navigatesuccess.";

function setup(reply: unknown) {
  const store = new Store(":memory:");
  const calls: LlmPrompt[] = [];
  const llm: LlmService = {
    defaultSelection: selection,
    async run(_selection, prompt) { calls.push(prompt); return { text: "", json: reply, providerSessionId: "p", selection }; },
    async listModels() { return { claude: { models: [] }, codex: { models: [] } }; },
  };
  const rt = new Runtime({ store, tasks: [mapSpecSteps], llm, git: () => ({}) as GitCapability, webspec: {} as WebspecCapability, searchfox: {} as SearchfoxCapability });
  const session = store.createSession({ worktree: "/repo", repoDir: "/repo/.git", title: "t" });
  const put = <T>(type: string, data: T, status: "verified" | "proposed" = "verified") => store.putArtifact({ sessionId: session.id, type, status, data, provenance: { taskId: "x" } });
  const diff = put<DiffData>("Diff", { baseSha: "B", headSha: "H", commits: [], files: [
    { path: "N.cpp", status: "modified", binary: false, hunks: [
      { id: "f0h0", header: "@@ -10,3 +10,4 @@", oldStart: 10, oldLines: 3, newStart: 10, newLines: 4, lines: [
        { kind: "ctx", text: "void Navigate() {" }, { kind: "del", text: "  Old();" }, { kind: "add", text: "  FireNavigate();" }, { kind: "add", text: "  if (mPending) Defer();" }, { kind: "ctx", text: "}" },
      ] },
      { id: "f0h1", header: "@@ -40,1 +41,2 @@", oldStart: 40, oldLines: 1, newStart: 41, newLines: 2, lines: [{ kind: "ctx", text: "x" }, { kind: "add", text: "  Unrelated();" }] },
      { id: "f0h2", header: "@@ -42,1 +42,1 @@", oldStart: 42, oldLines: 1, newStart: 42, newLines: 1, lines: [{ kind: "ctx", text: "Glue();" }] },
    ] },
  ] });
  const change = (id: string, hunkIds: string[]) => ({ id, title: `Change ${id}`, explanation: `Explains ${id}.`, rationale: "r", hunkIds, dependsOn: [], specUrls: [] });
  const narrative = put<PatchNarrativeData>("PatchNarrative", { diffId: diff.id, summary: "s", changes: [change("c1", ["f0h0", "f0h2"]), change("c2", ["f0h1"])] }, "proposed");
  const resolved = { spec: "HTML", anchor: "navigate", title: "navigate", type: "algorithm", url: "https://html.spec.whatwg.org/#navigate", content: STEPS };
  const spec = put<SpecReferenceData>("SpecReference", { url: resolved.url, resolved, origin: "code", geckoRefs: [] });
  store.putLink({ sessionId: session.id, from: spec.id, to: `${narrative.id}#c1`, kind: "supports" });
  const prose = put<SpecReferenceData>("SpecReference", { url: "https://x/#dfn", resolved: { ...resolved, anchor: "dfn", content: "A definition." }, origin: "code", geckoRefs: [] });
  store.putLink({ sessionId: session.id, from: prose.id, to: `${narrative.id}#c1`, kind: "supports" });
  const unresolved = put<SpecReferenceData>("SpecReference", { url: "https://x/#y", resolved: null, reason: "nope", origin: "llm", geckoRefs: [] }, "proposed");
  store.putLink({ sessionId: session.id, from: unresolved.id, to: `${narrative.id}#c1`, kind: "supports" });
  return { rt, store, session, narrativeId: narrative.id, specId: spec.id, calls };
}

test("mappableSpecs keeps resolved specs with numbered steps that support a change", () => {
  const { store, session, narrativeId, specId } = setup({ links: [], unmapped: [] });
  assert.deepEqual(mappableSpecs({ artifacts: store.listArtifacts(session.id), links: store.listLinks(session.id) }, narrativeId), [specId]);
});

test("the prompt numbers the steps and only the hunks of the spec's changes", async () => {
  const { rt, session, narrativeId, specId, calls } = setup({ links: [], unmapped: [] });
  await rt.run(session.id, "mapSpecSteps", { narrativeId, specId });
  const prompt = calls[0]!.prompt;
  for (const text of ["[1] Fire navigate.", "  [2.1] Defer the event.", "- Change c1: Explains c1.", "### f0h0 N.cpp", "   10   void Navigate() {", "   11(old) -   Old();", "   11 +   FireNavigate();"]) assert.ok(prompt.includes(text), text);
  assert.ok(!prompt.includes("Unrelated"));
  assert.equal(calls[0]!.tools, "none");
});

test("links are trimmed to the hunks' lines; unknown steps and lineless links are dropped", async () => {
  const { rt, store, session, narrativeId, specId } = setup({ unmapped: [
    { ranges: [{ path: "N.cpp", side: "new", start: 42, end: 42 }], reason: "plumbing", note: "Glue." },
    { ranges: [{ path: "N.cpp", side: "new", start: 99, end: 99 }], reason: "unexplained", note: "?" },
  ], links: [
    { step: "1", kind: "implements", ranges: [{ path: "N.cpp", side: "new", start: 9, end: 11 }], note: "Fires navigate." },
    { step: "2.1", kind: "partial", ranges: [{ path: "N.cpp", side: "new", start: 12, end: 12 }, { path: "N.cpp", side: "new", start: 43, end: 43 }], note: "Defers only when pending." },
    { step: "3", kind: "structural", ranges: [], note: "Happens after the commit." },
    { step: "9", kind: "implements", ranges: [{ path: "N.cpp", side: "new", start: 11, end: 11 }], note: "?" },
    { step: "2", kind: "deviates", ranges: [{ path: "Other.cpp", side: "new", start: 1, end: 2 }], note: "?" },
  ] });
  const { mapId } = await rt.run<{ mapId: string }>(session.id, "mapSpecSteps", { narrativeId, specId });
  const map = store.getArtifact<SpecStepMapData>(mapId);
  assert.equal(map.status, "proposed");
  assert.deepEqual(map.provenance.llm, selection);
  assert.deepEqual(map.data, {
    spec: specId, narrative: narrativeId,
    links: [
      { step: "1", kind: "implements", ranges: [{ path: "N.cpp", side: "new", start: 10, end: 11 }], note: "Fires navigate." },
      { step: "2.1", kind: "partial", ranges: [{ path: "N.cpp", side: "new", start: 12, end: 12 }], note: "Defers only when pending." },
      { step: "3", kind: "structural", ranges: [], note: "Happens after the commit." },
    ],
    unmapped: [{ ranges: [{ path: "N.cpp", side: "new", start: 42, end: 42 }], reason: "plumbing", note: "Glue." }],
    dropped: ["step 2.1: 1 range(s) outside the changes' hunks", "step 9: not a step of the section", "step 2: 1 range(s) outside the changes' hunks", "step 2: no lines left", "unmapped unexplained: 1 range(s) outside the changes' hunks"],
  });
  assert.deepEqual(store.listLinks(session.id).filter((l) => l.from === mapId).map((l) => [l.to, l.kind]), [[specId, "derivedFrom"], [narrativeId, "about"]]);
});

test("an invalid reply fails the task", async () => {
  const { rt, session, narrativeId, specId } = setup({ links: [{ step: 1 }] });
  await assert.rejects(rt.run(session.id, "mapSpecSteps", { narrativeId, specId }), /not valid JSON/);
});
