import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntime } from "../../../../src/runtime/create.ts";
import { createSession } from "../../../../src/runtime/git.ts";
import type { Runtime } from "../../../../src/runtime/tasks.ts";
import type { PatchNarrativeData } from "../../../../src/shared/types.ts";
import { narrativeOf } from "../../../../src/plugins/review/shared/diffs.ts";
import { makeRepo } from "../../../helpers/git-fixture.ts";

const STUB = fileURLToPath(new URL("../../../stubs/fake-llm.mjs", import.meta.url));

/** Runs the review phase; returns the Diff it narrated (the latest) and its narrative. */
async function runReview(rt: Runtime, sessionId: string, input: { base: string; head: string; diffId?: string }) {
  await rt.runPhase(sessionId, "review", { update: false, ...input });
  const artifacts = rt.store.listArtifacts(sessionId);
  const diffId = input.diffId ?? artifacts.filter((a) => a.type === "Diff").at(-1)!.id;
  return { diffId, narrativeId: narrativeOf(artifacts, diffId)!.id };
}

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "np-"));
  const r = makeRepo();
  r.commit({ "a.txt": "1\n2\n3\n" }, "base");
  r.commit({ "a.txt": "1\nTWO\n3\n", "c.txt": "c\n" }, "Bug 1 - Change things");
  const narrative = {
    summary: "Changes things.",
    changes: [
      { id: "c1", title: "Edit a", explanation: "e", rationale: "r", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] },
      { id: "c2", title: "Add c", explanation: "e", rationale: "r", hunkIds: ["f1h0"], dependsOn: ["c1"], specUrls: [] },
    ],
  };
  const out = join(dir, "claude-out.json");
  writeFileSync(out, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: narrative, session_id: "s", usage: { input_tokens: 5, output_tokens: 5 } }));
  const reviewOut = join(dir, "findings.json");
  writeFileSync(reviewOut, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { findings: [], verdicts: [] }, session_id: "s", usage: { input_tokens: 1, output_tokens: 1 } }));
  process.env.FAKE_LLM_ROUTES = JSON.stringify({ '"findings"': reviewOut });
  process.env.FAKE_LLM_STDOUT = out;
  process.env.FAKE_LLM_LOG = join(dir, "log.jsonl");
  return { dir, r, narrative };
}

test("review phase: importDiff, narrate, resolve spec refs and review, persisted with events", async () => {
  const { dir, r, narrative } = fixture();
  const rt = createRuntime({ dbPath: join(dir, "db.sqlite"), claudeBin: STUB });
  const session = await createSession(rt.store, r.dir, "t", "review");
  const { diffId, narrativeId } = await runReview(rt, session.id, { base: "HEAD~1", head: "HEAD" });
  const n = rt.store.getArtifact<PatchNarrativeData>(narrativeId);
  assert.deepEqual(n.data, { diffId, ...narrative });
  assert.deepEqual(rt.store.listEpochs(session.id).map(({ n, phase, status }) => ({ n, phase, status })), [{ n: 1, phase: "review", status: "succeeded" }]);
  assert.deepEqual(n.provenance.llm, { backend: "claude", model: "sonnet", effort: "medium" });
  const types = rt.store.listEvents(session.id).map((e) => e.type);
  assert.equal(types.filter((t) => t === "task.succeeded").length, 5);
  assert.equal(rt.store.listTasks(session.id).at(-1)?.kind, "review");
  assert.ok(types.includes("llm.usage"));
  const call = JSON.parse(readFileSync(process.env.FAKE_LLM_LOG!, "utf8").trim().split("\n")[0]);
  assert.equal(call.cwd, session.worktree);
});

test("review phase can narrate an existing Diff without importing another", async () => {
  const { dir, r } = fixture();
  const rt = createRuntime({ dbPath: join(dir, "reuse.sqlite"), claudeBin: STUB });
  const session = await createSession(rt.store, r.dir, "t", "review");
  const { diffId } = await rt.run<{ diffId: string }>(session.id, "importDiff", { base: "HEAD~1", head: "HEAD" });
  const before = rt.store.listArtifacts(session.id, "Diff").length;
  const result = await runReview(rt, session.id, { base: "HEAD~1", head: "HEAD", diffId });
  assert.equal(result.diffId, diffId);
  assert.equal(rt.store.listArtifacts(session.id, "Diff").length, before);
});

test("review phase carries findings after update narration and before resolving specs", async () => {
  const { dir, r, narrative } = fixture();
  const rt = createRuntime({ dbPath: join(dir, "epoch2.sqlite"), claudeBin: STUB });
  const session = await createSession(rt.store, r.dir, "t", "review");
  const { diffId: firstDiff } = await rt.run<{ diffId: string }>(session.id, "importDiff", { base: "HEAD~1", head: "HEAD" });
  const firstNarrative = await rt.run<{ narrativeId: string }>(session.id, "narrate", { diffId: firstDiff });
  r.commit({ "a.txt": "1\nTWO-EDITED\n3\n", "c.txt": "c\n" }, "second revision");
  const { diffId: secondDiff } = await rt.run<{ diffId: string }>(session.id, "importDiff", { base: "HEAD~2", head: "HEAD" });
  await rt.run(session.id, "interdiff", { fromDiffId: firstDiff, toDiffId: secondDiff });
  const stackNarrative = {
    ...narrative,
    summary: "Adds `c.txt`, then updates `a.txt` again.",
    commitIntents: ["Adds `c.txt`.", "Updates `a.txt` again."],
    flowHints: [null, null],
    changes: [
      { ...narrative.changes[1], hunkIds: ["f0h0", "f1h0"], dependsOn: [] },
      { ...narrative.changes[0], hunkIds: ["f0h1"], dependsOn: ["c2"] },
    ],
  };
  writeFileSync(join(dir, "claude-out.json"), JSON.stringify({ type: "result", is_error: false, result: "", structured_output: stackNarrative, session_id: "s", usage: { input_tokens: 5, output_tokens: 5 } }));
  const result = await runReview(rt, session.id, { base: "HEAD~2", head: "HEAD", diffId: secondDiff });
  assert.equal(rt.store.getArtifact<PatchNarrativeData>(result.narrativeId).data.previous, firstNarrative.narrativeId);
  assert.deepEqual(rt.store.listEpochs(session.id).map(({ n, phase, status }) => ({ n, phase, status })), [{ n: 1, phase: "review", status: "succeeded" }]);
  assert.deepEqual(rt.store.listTasks(session.id).slice(-4).map((task) => task.kind), ["narrate", "carryFindings", "resolveSpecRefs", "review"]);
});

const WEBSPEC = fileURLToPath(new URL("../../../stubs/fake-webspec.mjs", import.meta.url));

test("review phase maps the steps of cited specs alongside the review; a failed mapping does not fail it", async () => {
  const { dir, r, narrative } = fixture();
  const cited = { ...narrative, changes: [{ ...narrative.changes[0]!, specUrls: ["https://html.spec.whatwg.org/#edit"] }, { ...narrative.changes[1]!, specUrls: ["https://html.spec.whatwg.org/#add"] }] };
  writeFileSync(join(dir, "claude-out.json"), JSON.stringify({ type: "result", is_error: false, result: "", structured_output: cited, session_id: "s", usage: { input_tokens: 5, output_tokens: 5 } }));
  const mapOut = join(dir, "map.json");
  writeFileSync(mapOut, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { links: [{ step: "1", kind: "implements", ranges: [{ path: "a.txt", side: "new", start: 2, end: 2 }], note: "Edits it." }], unmapped: [] }, session_id: "s", usage: { input_tokens: 1, output_tokens: 1 } }));
  process.env.FAKE_LLM_ROUTES = JSON.stringify({ '"findings"': join(dir, "findings.json"), "# Spec: HTML#edit": mapOut });
  const rt = createRuntime({ dbPath: join(dir, "map.sqlite"), claudeBin: STUB, webspecBin: WEBSPEC });
  const session = await createSession(rt.store, r.dir, "t", "review");
  await runReview(rt, session.id, { base: "HEAD~1", head: "HEAD" });
  const mapTasks = rt.store.listTasks(session.id).filter((task) => task.kind === "mapSpecSteps");
  assert.deepEqual(mapTasks.map((task) => task.status).sort(), ["failed", "succeeded"]);
  const [map] = rt.store.listArtifacts(session.id, "SpecStepMap");
  assert.deepEqual((map!.data as { links: unknown[] }).links, [{ step: "1", kind: "implements", ranges: [{ path: "a.txt", side: "new", start: 2, end: 2 }], note: "Edits it." }]);
  assert.equal(rt.store.listTasks(session.id).find((task) => task.kind === "review")?.status, "succeeded");
});
