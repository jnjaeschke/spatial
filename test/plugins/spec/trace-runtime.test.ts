import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import type { WebspecCapability } from "../../../src/runtime/tasks.ts";
import { makeWebspec } from "../../../src/runtime/webspec.ts";
import { fakeCode } from "../../helpers/fake-code.ts";
import type { CodeSearch } from "../../../src/runtime/code-search.ts";
import { generateTrace } from "../../../src/plugins/spec/runtime/traces.ts";
import { addMappingStep } from "../../../src/plugins/spec/runtime/traces.ts";
import { ensureMapping, storedMapping, updateMapping } from "../../../src/plugins/spec/runtime/mappings.ts";
import { mappingKey } from "../../../src/plugins/spec/shared/engine.ts";
import { mappingStepSite } from "../../../src/plugins/spec/shared/trace-check.ts";
import { traceStatus } from "../../../src/plugins/spec/shared/traces.ts";
import type { EngineMapping, GeneratedTrace, NoteResult, SpecOpenedData, SpecTraceCheckData, SpecTraceData } from "../../../src/plugins/spec/shared/types.ts";
import { putAlgorithm, specRuntime } from "../../helpers/spec-runtime.ts";

const fake = makeWebspec({ bin: fileURLToPath(new URL("../../stubs/fake-webspec.mjs", import.meta.url)) });
const TRACE: GeneratedTrace = { title: "Snapshot before origin", entries: [
  { anchor: "HTML#navigate", step: "2", note: "Snapshots the source params.", hop: "start", code: [{ engine: "gecko", path: "a.cc", line: 3, quote: "if (!doc) return;" }, { engine: "gecko", path: "a.cc", line: 2, quote: "nope" }] },
  { anchor: "HTML#snapshotting-source-snapshot-params", step: "1", note: "Edits the line.", hop: "call", code: [] },
  { anchor: "HTML#navigate", step: "3", note: "Creates the opaque origin.", hop: "return", code: [] },
  { anchor: "HTML#setup", step: "1", note: "", hop: "call", code: [] },
], verdict: { answer: "fails", reasoning: "Step 3 runs after step 2." } };
const FILE = "int a;\nvoid Navigate() {\n  if (!doc) return;\n}";
const CODE = fakeCode({ "a.cc": FILE }, [], { engine: "gecko", repoBase: "https://sf/" }).code;
const MAPPING: EngineMapping = { engine: "gecko", repoBase: "https://sf/", rev: "r1", sites: [{ path: "a.cc", line: 2, symbol: "_Z8Navigatev", signature: "void Navigate() {", quote: "void Navigate() {", method: "spec-link", refs: [1], steps: [] }], tests: [], rejected: [], checkedAt: "2026-10-11T00:00:00.000Z" };
const navigate = (line: number, quote: string, step = "7") => ({ ref: "HTML#navigate", step, code: { engine: "gecko" as const, path: "a.cc", line, quote } });

function setup(notes: NoteResult[] | (() => NoteResult[]), webspec: WebspecCapability = fake, gecko: CodeSearch = CODE) {
  const { rt, session, prompts } = specRuntime({ webspec, codeSearch: { gecko }, reply: (prompt) => prompt.system!.startsWith("You trace web spec algorithms") ? TRACE : prompt.system!.startsWith("You check notes on a trace") ? { notes: (typeof notes === "function" ? notes() : notes).slice(0, (prompt.prompt.match(/^## Note /gm) ?? []).length) } : { clauses: [] } });
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
  const check = status.check!.data;
  assert.deepEqual(status.trace.data.entries, TRACE.entries);
  assert.deepEqual(check.code, [{ entry: 0, ref: 0, url: "https://sf/rev/r1/a.cc#3" }]);
  assert.deepEqual(check.droppedCode, [{ entry: 0, ref: 1, reason: "a.cc:2 does not read `nope`" }]);
  assert.match(prompts.find((p) => p.system!.startsWith("You check notes on a trace"))!.prompt, /gecko a\.cc:3: if \(!doc\) return;/);
  assert.doesNotMatch(prompts.find((p) => p.system!.startsWith("You check notes on a trace"))!.prompt, /nope/);
  assert.equal(status.trace.status, "proposed");
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

test("mappingStepSite hints at the nearest non-stale site above in the same file, unless it maps the step already", () => {
  assert.equal(mappingStepSite(MAPPING, { path: "a.cc", line: 3 }, "7"), 0);
  assert.equal(mappingStepSite(MAPPING, { path: "a.cc", line: 1 }, "7"), null);
  assert.equal(mappingStepSite(MAPPING, { path: "b.cc", line: 3 }, "7"), null);
  assert.equal(mappingStepSite({ ...MAPPING, sites: [{ ...MAPPING.sites[0]!, steps: [{ step: "7", line: 3, verdict: "match", detail: "" }] }] }, { path: "a.cc", line: 3 }, "7"), null);
  assert.equal(mappingStepSite({ ...MAPPING, sites: [{ ...MAPPING.sites[0]!, stale: true }] }, { path: "a.cc", line: 3 }, "7"), null);
});

test("addMappingStep re-verifies the quote and stores a user version with the proposed step on the site whose function holds the line", async () => {
  const { rt, session } = setup([]);
  rt.knowledge.put("global", "spec", mappingKey("gecko", "HTML#navigate"), MAPPING, { by: "plugin", sessionId: session.id });
  await assert.rejects(addMappingStep(rt, session.id, navigate(2, "if (!doc)")), /a\.cc:2 does not read `if \(!doc\)`/);
  await assert.rejects(addMappingStep(rt, session.id, navigate(3, "if (!doc)")), /a\.cc:3 does not read `if \(!doc\)`/);
  await assert.rejects(addMappingStep(rt, session.id, navigate(1, "int a;")), /No gecko site of HTML#navigate holds a\.cc:1/);
  const entry = await addMappingStep(rt, session.id, navigate(3, "if (!doc) return;"));
  assert.deepEqual((entry.value as EngineMapping).sites[0]!.steps, [{ step: "7", line: 3, end: 3, quote: "if (!doc) return;", verdict: "proposed", detail: "Cited by a spec trace", origin: "trace" }]);
  assert.deepEqual(entry.provenance, { by: "user", sessionId: session.id });
  await assert.rejects(addMappingStep(rt, session.id, navigate(3, "if (!doc) return;")), /void Navigate\(\) \{ maps step 7 already/);
});

test("addMappingStep stores the step at the mapping's revision when the file moved since", async () => {
  const { rt, session } = setup([], fake, fakeCode({ "a.cc": `int b;\n${FILE}` }, [], { engine: "gecko", repoBase: "https://sf/" }).code);
  rt.knowledge.put("global", "spec", mappingKey("gecko", "HTML#navigate"), MAPPING, { by: "plugin", sessionId: session.id });
  const entry = await addMappingStep(rt, session.id, navigate(4, "if (!doc) return;"));
  assert.deepEqual((entry.value as EngineMapping).sites[0]!.steps.map((step) => [step.line, step.end]), [[3, 3]]);
});

test("addMappingStep refuses when a mapping write moves the site while its file is read", async () => {
  let reads = 0, move = () => {};
  const { rt, session } = setup([], fake, { ...CODE, file: async (path, signal) => { if (++reads === 2) move(); return CODE.file(path, signal); } });
  rt.knowledge.put("global", "spec", mappingKey("gecko", "HTML#navigate"), MAPPING, { by: "plugin", sessionId: session.id });
  move = () => updateMapping(rt, session.id, "gecko", "HTML#navigate", { by: "plugin", sessionId: session.id }, (mapping) => ({ ...mapping!, sites: mapping!.sites.map((site) => ({ ...site, line: site.line + 1 })) }));
  await assert.rejects(addMappingStep(rt, session.id, navigate(3, "if (!doc) return;")), /The gecko mapping of HTML#navigate changed; try again/);
});

test("a trace step stored while a mapping runs survives the mapping's write", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const { code } = fakeCode({ "a.cc": "// https://html.spec.whatwg.org/#setup\nvoid Setup() {\n  Edit();\n}" }, [{ group: "Code", path: "a.cc", line: 1, url: "u" }]);
  const slow = { ...code, async specRefs(url: string, signal: AbortSignal, limit?: number) { await gate; return code.specRefs(url, signal, limit); } };
  const { rt, session } = specRuntime({ codeSearch: { blink: slow } });
  const algorithm = putAlgorithm(rt, session.id);
  updateMapping(rt, session.id, "blink", "HTML#setup", { by: "plugin", sessionId: session.id }, () => ({ engine: "blink", repoBase: "r/", rev: "main", sites: [{ path: "a.cc", line: 2, symbol: "Setup()", signature: "void Setup() {", quote: "void Setup() {", method: "spec-link-heuristic", refs: [1], steps: [] }], tests: [], rejected: [], checkedAt: new Date(0).toISOString() }));
  const running = ensureMapping(rt, session.id, "blink", algorithm);
  await new Promise((resolve) => setImmediate(resolve));
  await addMappingStep(rt, session.id, { ref: "HTML#setup", step: "1", code: { engine: "blink", path: "a.cc", line: 3, quote: "Edit();" } });
  release();
  await running;
  assert.deepEqual(storedMapping(rt.knowledge, "blink", "HTML#setup")!.sites.map((site) => site.steps.map((step) => [step.step, step.line, step.origin])), [[["1", 3, "trace"]]]);
});

test("a re-check verifies the code references again", async () => {
  const files = { "a.cc": FILE };
  const { rt, session, artifacts, check: run } = setup([supported, supported, supported], fake, fakeCode(files, [], { engine: "gecko", repoBase: "https://sf/" }).code);
  await generateTrace(rt, session.id, { traceId: "T1", mode: "claim", question: "q", anchors: [], contextTraceId: null });
  files["a.cc"] = `int b;\n${FILE}`;
  const status = traceStatus(artifacts(), "T1")!;
  const checked = await run("T1", status.trace.id);
  assert.deepEqual(checked.code, []);
  assert.deepEqual(checked.droppedCode[0], { entry: 0, ref: 0, reason: "a.cc:3 does not read `if (!doc) return;`" });
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
