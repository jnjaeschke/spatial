import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import type { WebspecCapability } from "../../../src/runtime/tasks.ts";
import { makeWebspec } from "../../../src/runtime/webspec.ts";
import { checkTrace, generateTrace } from "../../../src/plugins/spec/runtime/traces.ts";
import { traceStatus } from "../../../src/plugins/spec/shared/traces.ts";
import type { GeneratedTrace, NoteResult, SpecOpenedData, SpecTraceCheckData, SpecTraceData } from "../../../src/plugins/spec/shared/types.ts";
import { specRuntime } from "../../helpers/spec-runtime.ts";

const fake = makeWebspec({ bin: fileURLToPath(new URL("../../stubs/fake-webspec.mjs", import.meta.url)) });
const TRACE: GeneratedTrace = { title: "Snapshot before origin", entries: [
  { anchor: "HTML#navigate", step: "2", note: "Snapshots the source params.", hop: "start" },
  { anchor: "HTML#snapshotting-source-snapshot-params", step: "1", note: "Edits the line.", hop: "call" },
  { anchor: "HTML#navigate", step: "3", note: "Creates the opaque origin.", hop: "return" },
  { anchor: "HTML#setup", step: "1", note: "", hop: "call" },
], verdict: { answer: "fails", reasoning: "Step 3 runs after step 2." } };

function setup(notes: NoteResult[], webspec: WebspecCapability = fake) {
  const { rt, session, prompts } = specRuntime({ webspec, reply: (prompt) => prompt.system!.startsWith("You trace web spec algorithms") ? TRACE : prompt.system!.startsWith("You check notes on a trace") ? { notes: notes.slice(0, (prompt.prompt.match(/^## Note /gm) ?? []).length) } : { clauses: [] } });
  rt.store.putArtifact({ sessionId: session.id, type: "WorkflowStart", status: "verified", provenance: { taskId: "user" }, data: { via: "command", workflow: "explore", params: { query: "HTML#navigate" }, title: "t", prompt: "HTML#navigate" } });
  const artifacts = () => [...rt.store.listArtifacts(session.id, "SpecTrace"), ...rt.store.listArtifacts(session.id, "SpecTraceCheck")];
  return { rt, session, prompts, artifacts };
}
const supported = { supported: true, reason: "ok" };

test("generateTrace stores the LLM trace verbatim, checks it, verifies its notes and opens its boxes", async () => {
  const { rt, session, prompts, artifacts } = setup([supported, supported, supported]);
  await generateTrace(rt, session.id, { traceId: "T1", mode: "claim", question: "Is the snapshot first?", anchors: [], contextTraceId: null });
  const status = traceStatus(artifacts(), "T1")!;
  assert.deepEqual(status.trace.data.entries, TRACE.entries);
  assert.equal(status.trace.status, "proposed");
  const check = status.check!.data;
  assert.deepEqual(check.hops.map((hop) => hop.ok ? "" : hop.reason), ["", "", "", "HTML#navigate step 3 does not link HTML#setup"]);
  assert.deepEqual(check.notes, [supported, supported, supported, null]);
  assert.deepEqual(check.verdict, TRACE.verdict);
  assert.equal(status.outdated, false);
  assert.equal(prompts.filter((p) => p.system!.startsWith("You check notes on a trace")).length, 1);
  assert.deepEqual(rt.store.listArtifacts(session.id, "SpecOpened").map((a) => a.data as SpecOpenedData), [
    { anchor: "HTML#navigate", from: null },
    { anchor: "HTML#snapshotting-source-snapshot-params", from: { anchor: "HTML#navigate", step: "2" } },
    { anchor: "HTML#setup", from: { anchor: "HTML#navigate", step: "3" } },
  ]);
});

test("checkTrace on a user version: the old check is outdated until the re-check, which keeps the verdict and opens nothing", async () => {
  const { rt, session, artifacts } = setup([supported, supported, supported, { supported: false, reason: "Step 1 edits, it does not set up." }]);
  await generateTrace(rt, session.id, { traceId: "T1", mode: "claim", question: "q", anchors: [], contextTraceId: null });
  const generated = traceStatus(artifacts(), "T1")!;
  const edited = rt.store.putArtifact<SpecTraceData>({ sessionId: session.id, type: "SpecTrace", status: "verified", provenance: { taskId: "user" }, data: { ...generated.trace.data, entries: generated.trace.data.entries.map((entry, i) => i === 3 ? { ...entry, note: "Sets things up." } : entry) } });
  assert.equal(traceStatus(artifacts(), "T1")!.outdated, true);
  const opened = rt.store.listArtifacts(session.id, "SpecOpened").length;
  await checkTrace(rt, session.id, edited.id, generated.check!.data.verdict, false);
  const status = traceStatus(artifacts(), "T1")!;
  assert.equal(status.outdated, false);
  assert.equal(status.check!.data.traceArtifactId, edited.id);
  assert.deepEqual(status.check!.data.verdict, TRACE.verdict);
  assert.deepEqual(status.check!.data.notes[3], { supported: false, reason: "Step 1 edits, it does not set up." });
  assert.equal(rt.store.listArtifacts(session.id, "SpecOpened").length, opened);
});

test("an unknown section is an unverified hop with webspec-index's reason, and its note is unsupported without asking", async () => {
  const webspec: WebspecCapability = { ...fake, query: async (ref, signal) => ref === "HTML#gone" ? { found: false, reason: "Section not found: HTML#gone" } : fake.query(ref, signal) };
  const { rt, session, prompts } = setup([], webspec);
  const trace = rt.store.putArtifact<SpecTraceData>({ sessionId: session.id, type: "SpecTrace", status: "verified", provenance: { taskId: "user" }, data: { traceId: "T2", title: "t", entries: [{ anchor: "HTML#navigate", step: "2", note: "", hop: "start" }, { anchor: "HTML#gone", step: "1", note: "Gone.", hop: "call" }] } });
  const check = (await checkTrace(rt, session.id, trace.id, null, false)).data as SpecTraceCheckData;
  assert.deepEqual(check.hops[1], { ok: false, reason: "HTML#gone is not a known spec section: Section not found: HTML#gone" });
  assert.deepEqual(check.notes, [null, { supported: false, reason: "HTML#gone is not a known spec section" }]);
  assert.equal(check.notesTaskId, null);
  assert.equal(prompts.filter((p) => p.system!.startsWith("You check notes on a trace")).length, 0);
});
