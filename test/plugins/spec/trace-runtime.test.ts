import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import type { WebspecCapability } from "../../../src/runtime/tasks.ts";
import { makeWebspec } from "../../../src/runtime/webspec.ts";
import { generateTrace } from "../../../src/plugins/spec/runtime/traces.ts";
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

function setup(notes: NoteResult[] | (() => NoteResult[]), webspec: WebspecCapability = fake) {
  const { rt, session, prompts } = specRuntime({ webspec, reply: (prompt) => prompt.system!.startsWith("You trace web spec algorithms") ? TRACE : prompt.system!.startsWith("You check notes on a trace") ? { notes: (typeof notes === "function" ? notes() : notes).slice(0, (prompt.prompt.match(/^## Note /gm) ?? []).length) } : { clauses: [] } });
  rt.store.putArtifact({ sessionId: session.id, type: "WorkflowStart", status: "verified", provenance: { taskId: "user" }, data: { via: "command", workflow: "explore", params: { query: "HTML#navigate" }, title: "t", prompt: "HTML#navigate" } });
  const artifacts = () => [...rt.store.listArtifacts(session.id, "SpecTrace"), ...rt.store.listArtifacts(session.id, "SpecTraceCheck")];
  const check = (traceId: string, traceArtifactId: string) => rt.run<{ checkId: string }>(session.id, "checkTrace", { traceId, traceArtifactId }).then(({ checkId }) => rt.store.getArtifact<SpecTraceCheckData>(checkId).data);
  return { rt, session, prompts, artifacts, check };
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
  const checkTask = rt.store.listTasks(session.id).find((task) => task.kind === "checkTrace")!;
  assert.equal(status.check!.provenance.taskId, checkTask.id);
  assert.deepEqual(rt.store.listTasks(session.id).filter((task) => task.parentId === checkTask.id).map((task) => task.kind), ["loadSpecAlgorithm", "loadSpecAlgorithm", "loadSpecAlgorithm", "verifyTraceNotes"]);
  assert.deepEqual(rt.store.listArtifacts(session.id, "SpecOpened").map((a) => a.data as SpecOpenedData), [
    { anchor: "HTML#navigate", from: null },
    { anchor: "HTML#snapshotting-source-snapshot-params", from: { anchor: "HTML#navigate", step: "2" } },
    { anchor: "HTML#setup", from: { anchor: "HTML#navigate", step: "3" } },
  ]);
});

test("checkTrace on a user version: the old check is outdated until the re-check, which keeps the generated verdict and opens nothing", async () => {
  const { rt, session, artifacts, check } = setup([supported, supported, supported, { supported: false, reason: "Step 1 edits, it does not set up." }]);
  await generateTrace(rt, session.id, { traceId: "T1", mode: "claim", question: "q", anchors: [], contextTraceId: null });
  const generated = traceStatus(artifacts(), "T1")!;
  const edited = rt.store.putArtifact<SpecTraceData>({ sessionId: session.id, type: "SpecTrace", status: "verified", provenance: { taskId: "user" }, data: { traceId: "T1", title: generated.trace.data.title, question: generated.trace.data.question!, entries: generated.trace.data.entries.map((entry, i) => i === 3 ? { ...entry, note: "Sets things up." } : entry) } });
  assert.equal(traceStatus(artifacts(), "T1")!.outdated, true);
  const opened = rt.store.listArtifacts(session.id, "SpecOpened").length;
  await check("T1", edited.id);
  const status = traceStatus(artifacts(), "T1")!;
  assert.equal(status.outdated, false);
  assert.equal(status.check!.data.traceArtifactId, edited.id);
  assert.deepEqual(status.check!.data.verdict, TRACE.verdict);
  assert.deepEqual(status.check!.data.notes[3], { supported: false, reason: "Step 1 edits, it does not set up." });
  assert.equal(rt.store.listArtifacts(session.id, "SpecOpened").length, opened);
});

test("an unknown section is an unverified hop with webspec-index's reason, and its note is unsupported without asking", async () => {
  const webspec: WebspecCapability = { ...fake, query: async (ref, signal) => ref === "HTML#gone" ? { found: false, reason: "Section not found: HTML#gone" } : fake.query(ref, signal) };
  const { rt, session, prompts, check: run } = setup([], webspec);
  const trace = rt.store.putArtifact<SpecTraceData>({ sessionId: session.id, type: "SpecTrace", status: "verified", provenance: { taskId: "user" }, data: { traceId: "T2", title: "t", entries: [{ anchor: "HTML#navigate", step: "2", note: "", hop: "start" }, { anchor: "HTML#gone", step: "1", note: "Gone.", hop: "call" }] } });
  const check = await run("T2", trace.id);
  assert.deepEqual(check.hops[1], { ok: false, reason: "HTML#gone is not a known spec section: Section not found: HTML#gone" });
  assert.deepEqual(check.notes, [null, { supported: false, reason: "HTML#gone is not a known spec section" }]);
  assert.equal(prompts.filter((p) => p.system!.startsWith("You check notes on a trace")).length, 0);
});

test("a failed note check keeps the tracer's verdict for the re-check and still opens the boxes", async () => {
  let calls = 0;
  const { rt, session, artifacts, check } = setup(() => ++calls <= 2 ? [] : [supported, supported, supported]);
  await assert.rejects(generateTrace(rt, session.id, { traceId: "T1", mode: "claim", question: "q", anchors: [], contextTraceId: null }), /Expected 3 verdicts, got 0/);
  const status = traceStatus(artifacts(), "T1")!;
  assert.equal(status.check, null);
  assert.equal(rt.store.listArtifacts(session.id, "SpecOpened").length, 3);
  assert.equal(rt.store.listTasks(session.id).find((task) => task.kind === "checkTrace")!.status, "failed");
  assert.deepEqual((await check("T1", status.trace.id)).verdict, TRACE.verdict);
});

test("an async hop is checked against the witness paths of the previous step's effects", async () => {
  const { rt, session, check } = setup([]);
  const trace = rt.store.putArtifact<SpecTraceData>({ sessionId: session.id, type: "SpecTrace", status: "verified", provenance: { taskId: "user" }, data: { traceId: "T3", title: "t", entries: [{ anchor: "HTML#navigate", step: "20", note: "", hop: "start" }, { anchor: "HTML#abort-a-navigateevent", step: "1", note: "", hop: "async" }, { anchor: "HTML#navigate", step: "3", note: "", hop: "async" }] } });
  const { hops } = await check("T3", trace.id);
  assert.deepEqual(hops.map((hop) => hop.ok ? "" : hop.reason), ["", "", "HTML#abort-a-navigateevent step 1 has no scheduling or event effect"]);
  assert.ok(rt.store.listTasks(session.id).some((task) => task.kind === "loadEffectPath"));
});
