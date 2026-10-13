import { test } from "node:test";
import assert from "node:assert/strict";
import { KnowledgeStore } from "../../../src/runtime/knowledge.ts";
import { testRuntime } from "../../helpers/runtime.ts";
import type { LlmSelection, RuntimeEvent } from "../../../src/shared/types.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";
import { rememberSteer } from "../../../src/plugins/implement/runtime/distill.ts";
import { memoryKey } from "../../../src/plugins/implement/runtime/memories.ts";
import type { MemoryNoticeData, SteerData, SteerMemory } from "../../../src/plugins/implement/shared/types.ts";

const selection: LlmSelection = { backend: "claude", model: "sonnet", effort: "medium" };
const fields = { situation: "the agent adds a helper", observed: "It named the helper after its caller", wanted: "Name helpers after what they return", why: null, phases: ["implement"], kinds: [] };
const reply = (over: object = {}) => ({ action: "add", key: "name-helpers", scope: "repo", memory: fields, ...over });

function setup(replies: unknown[]) {
  const knowledge = new KnowledgeStore(":memory:");
  const { rt, store, session, prompts } = testRuntime({ plugins: [specPlugin, reviewPlugin, implementPlugin], selection, reply: () => replies.shift(), knowledge, session: { workflow: "implement" } });
  store.createEpoch(session.id, "implement", null);
  const put = (type: string, data: unknown) => store.putArtifact({ sessionId: session.id, type, status: "verified", data, provenance: { taskId: "t" } });
  const events: RuntimeEvent[] = [];
  rt.onEvent((event) => events.push(event));
  return { store, knowledge, rt, session, prompts, put, events };
}
const command = (command: string, exitCode: number) => ({ command, exitCode, durationMs: 1, output: "", test: false });

test("the distillation prompt carries the steer, what ran before it, the stopped run's progress, the kind and the current memories", async () => {
  const { rt, session, knowledge, prompts, put } = setup([reply()]);
  knowledge.put("/repo/.git", "implement", memoryKey("name-things"), { ...fields, source: { sessionId: "S", epoch: 1, steer: "ST" } } satisfies SteerMemory, { by: "user", sessionId: "S" });
  put("Investigation", { kind: "bugfix" });
  put("CommandRun", command("./mach build", 1));
  const steer = put("Steer", { text: "stop retrying the build", epoch: 1, phase: "implement" });
  put("CommandRun", command("late-command", 0));
  rt.emit(session.id, "task:T1", "task.progress", { taskId: "T1", progress: { kind: "indeterminate", message: "editing a.txt" } });
  const out = await rt.run<{ action: string }>(session.id, "distillSteer", { steerId: steer.id, taskId: "T1" });
  assert.equal(out.action, "add");
  assert.equal(prompts[0]!.tools, "none");
  for (const text of ["stop retrying the build", "implement", "bugfix", "`./mach build` exited 1", "editing a.txt", "repo name-things"]) assert.ok(prompts[0]!.prompt.includes(text), text);
  assert.ok(!prompts[0]!.prompt.includes("late-command"));
});

test("an invalid proposal is repaired once and then rejected", async () => {
  const bad = reply({ key: "No Spaces" });
  const repaired = setup([bad, reply()]);
  const steer = repaired.put("Steer", { text: "x", epoch: 1, phase: "implement" });
  assert.equal((await repaired.rt.run<{ key: string }>(repaired.session.id, "distillSteer", { steerId: steer.id, taskId: null })).key, "name-helpers");
  assert.equal(repaired.prompts.length, 2);
  assert.ok(repaired.prompts[1]!.prompt.includes("key must match"));
  const rejected = setup([reply({ action: "update" }), reply({ action: "update" })]);
  const second = rejected.put("Steer", { text: "x", epoch: 1, phase: "implement" });
  await assert.rejects(rejected.rt.run(rejected.session.id, "distillSteer", { steerId: second.id, taskId: null }), /failed validation/);
});

test("remembering writes the memory with its source, a notice linked to the steer and a toast; an update replaces the entry", async () => {
  const { rt, store, knowledge, session, put, events } = setup([reply(), reply({ action: "update", memory: { ...fields, wanted: "Name helpers after their result" } })]);
  const steer = put("Steer", { text: "name it better", epoch: 1, phase: "implement" }) as import("../../../src/shared/types.ts").Artifact<SteerData>;
  await rememberSteer(rt, session.id, steer, null);
  const read = knowledge.get("/repo/.git", "implement", memoryKey("name-helpers"));
  assert.equal(read.state, "current");
  if (read.state !== "current") return;
  assert.deepEqual((read.entry.value as SteerMemory).source, { sessionId: session.id, epoch: 1, steer: steer.id });
  assert.equal(read.entry.provenance.by, "llm");
  const task = store.listTasks(session.id).find((t) => t.kind === "distillSteer")!;
  assert.deepEqual(read.entry.provenance, { by: "llm", taskId: task.id, sessionId: session.id });
  const notice = store.listArtifacts(session.id, "MemoryNotice")[0] as import("../../../src/shared/types.ts").Artifact<MemoryNoticeData>;
  assert.deepEqual([notice.data.key, notice.data.scope, notice.data.entryId, notice.status], ["name-helpers", "repo", read.entry.id, "verified"]);
  assert.deepEqual(notice.data.memory, read.entry.value);
  assert.ok(store.listLinks(session.id).some((link) => link.from === notice.id && link.to === steer.id && link.kind === "about"));
  const toast = events.find((event) => event.type === "notify")!.payload as { id: string; title: string; body: string };
  assert.deepEqual([toast.id, toast.title, toast.body], [`memory-${read.entry.id}`, "Remembered: Name helpers after what they return", "When the agent adds a helper"]);
  await rememberSteer(rt, session.id, steer, null);
  const updated = knowledge.get("/repo/.git", "implement", memoryKey("name-helpers"));
  assert.equal(updated.state === "current" && (updated.entry.value as SteerMemory).wanted, "Name helpers after their result");
  assert.equal(store.listArtifacts(session.id, "MemoryNotice").length, 2);
});
