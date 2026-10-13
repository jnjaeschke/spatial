import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import type { Runtime } from "../../../src/runtime/tasks.ts";
import { corePlugin } from "../../../src/runtime/create.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { makeWebspec } from "../../../src/plugins/spec/runtime/webspec.ts";
import { ensureSummary, summaryKey, summaryViews } from "../../../src/plugins/spec/runtime/summaries.ts";
import { specRoutes } from "../../../src/plugins/spec/server/routes.ts";
import type { SpecAlgorithmData } from "../../../src/plugins/spec/shared/types.ts";
import type { Artifact } from "../../../src/shared/types.ts";
import { routeCall } from "../../helpers/route-call.ts";
import { specTestServices } from "../../helpers/spec-services.ts";
import { testRuntime } from "../../helpers/runtime.ts";

const webspec = makeWebspec({ bin: fileURLToPath(new URL("../../stubs/fake-webspec.mjs", import.meta.url)) });
function setup(replies: { summary: unknown; verdicts?: unknown }) {
  const { rt, session, prompts } = testRuntime({ plugins: [corePlugin, specPlugin], reply: (prompt) => prompt.system!.startsWith("You check") ? replies.verdicts : replies.summary, services: specTestServices({ webspec }), session: {} });
  return { rt, session, prompts };
}
async function algorithm(rt: Runtime, sessionId: string, ref = "HTML#setup") {
  const { algorithmId } = await rt.run<{ algorithmId: string }>(sessionId, "loadSpecAlgorithm", { ref });
  return rt.store.getArtifact<SpecAlgorithmData>(algorithmId);
}
const summary = { clauses: [{ text: "Edits the line, then adds the file.", steps: ["1", "2"] }] };

test("a verified summary goes into the knowledge store with LLM provenance, and is not recomputed", async () => {
  const { rt, session, prompts } = setup({ summary, verdicts: { clauses: [{ supported: true, reason: "Steps 1 and 2." }] } });
  const a = await algorithm(rt, session.id);
  await ensureSummary(rt, session.id, a);
  const read = rt.knowledge.get("global", "spec", summaryKey(a.data));
  assert.equal(read.state, "current");
  if (read.state !== "current") return;
  assert.deepEqual(read.entry.value, summary);
  assert.equal(read.entry.provenance.by, "llm");
  assert.equal(prompts.length, 2);
  assert.match(prompts[0]!.prompt, /\[1\] Edit the line\.\n\[2\] Add the file\./);
  await ensureSummary(rt, session.id, a);
  assert.equal(prompts.length, 2);
  assert.deepEqual(summaryViews(rt, session.id), { "HTML#setup": { state: "ready", clauses: summary.clauses } });
});

test("a failed deterministic check is rejected without verification and not retried", async () => {
  const { rt, session, prompts } = setup({ summary: { clauses: [{ text: "Uses `nothing`.", steps: ["1"] }] } });
  const a = await algorithm(rt, session.id);
  await ensureSummary(rt, session.id, a);
  assert.equal(prompts.length, 1);
  assert.deepEqual(rt.store.listArtifacts(session.id, "SummaryRejected").map((r) => r.data), [{ anchor: "HTML#setup", sha: "fake-setup", reasons: ["Clause 1 names `nothing`, which its cited steps do not mention"] }]);
  await ensureSummary(rt, session.id, a);
  assert.equal(prompts.length, 1);
  assert.deepEqual(summaryViews(rt, session.id)["HTML#setup"], { state: "rejected" });
});

test("an unsupported clause is rejected with the verifier's reason", async () => {
  const { rt, session } = setup({ summary, verdicts: { clauses: [{ supported: false, reason: "Step 2 adds, it does not delete." }] } });
  await ensureSummary(rt, session.id, await algorithm(rt, session.id));
  assert.deepEqual((rt.store.listArtifacts(session.id, "SummaryRejected")[0]!.data as { reasons: string[] }).reasons, ["Clause 1: Step 2 adds, it does not delete."]);
});

test("a flagged summary is a tombstone and is not regenerated; concurrent opens run once", async () => {
  const { rt, session, prompts } = setup({ summary, verdicts: { clauses: [{ supported: true, reason: "ok" }] } });
  const a = await algorithm(rt, session.id);
  await Promise.all([ensureSummary(rt, session.id, a), ensureSummary(rt, session.id, a)]);
  assert.equal(prompts.length, 2);
  assert.equal((await routeCall(specRoutes(rt), "POST", `/api/sessions/${session.id}/spec/summaries/flag`, { ref: "HTML#setup" })).status, 201);
  assert.equal(rt.knowledge.get("global", "spec", summaryKey(a.data)).state, "deleted");
  await ensureSummary(rt, session.id, a);
  assert.equal(prompts.length, 2);
  assert.deepEqual((await routeCall(specRoutes(rt), "GET", `/api/sessions/${session.id}/spec/summaries`)).body, { "HTML#setup": { state: "flagged" } });
});

test("sections without steps get no summary", async () => {
  const { rt, session, prompts } = setup({ summary });
  const a = await algorithm(rt, session.id);
  await ensureSummary(rt, session.id, { ...a, data: { ...a.data, content: "A definition." } } as Artifact<SpecAlgorithmData>);
  assert.equal(prompts.length, 0);
});
