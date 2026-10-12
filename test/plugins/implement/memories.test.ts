import { test } from "node:test";
import assert from "node:assert/strict";
import { KnowledgeStore } from "../../../src/runtime/knowledge.ts";
import { confirmedKey, currentMemories, distillProblems, memoryBullet, memoryKey, memoryProblems, memorySections, relevantMemories, type DistillReply } from "../../../src/plugins/implement/runtime/memories.ts";
import type { SteerMemory } from "../../../src/plugins/implement/shared/types.ts";
import type { TaskContext } from "../../../src/plugin-api.ts";

const memory = (over: Partial<SteerMemory> = {}): SteerMemory => ({ situation: "a test fails for an unrelated reason", observed: "The agent kept retrying", wanted: "Stop and report it", why: null, phases: ["implement"], kinds: [], source: { sessionId: "S", epoch: 1, steer: "ST" }, ...over });
const user = { by: "user", sessionId: "S" } as const;
const REPO = "/r/.git";

function store() {
  const knowledge = new KnowledgeStore(":memory:");
  knowledge.put(REPO, "implement", memoryKey("report-failure"), memory(), user);
  knowledge.put(REPO, "implement", memoryKey("only-bugfix"), memory({ kinds: ["bugfix"], why: "it wastes time" }), user);
  knowledge.put("global", "implement", memoryKey("short-commits"), memory({ phases: ["implement", "investigate"] }), user);
  knowledge.put("global", "implement", memoryKey("forgotten"), null, user);
  knowledge.put("/other/.git", "implement", memoryKey("elsewhere"), memory(), user);
  return knowledge;
}

test("current memories are the repo's then the global ones without tombstones; confirmed follows the current entry", () => {
  const knowledge = store();
  const id = knowledge.list(REPO, "implement", "memory/").find((entry) => entry.key === memoryKey("report-failure"))!.id;
  knowledge.put(REPO, "implement", confirmedKey("report-failure"), { entryId: id }, user);
  const summary = () => currentMemories(knowledge, REPO).map((view) => [view.scope, view.key, view.confirmed]);
  assert.deepEqual(summary(), [["repo", "only-bugfix", false], ["repo", "report-failure", true], ["global", "short-commits", false]]);
  knowledge.put(REPO, "implement", memoryKey("report-failure"), memory({ wanted: "changed" }), user);
  assert.deepEqual(summary()[1], ["repo", "report-failure", false]);
});

test("relevant memories match the phase, and the kind unless they apply to every kind", () => {
  const knowledge = store();
  const keys = (phase: string, kind: string | null) => relevantMemories(knowledge, REPO, phase, kind).map((view) => view.key);
  assert.deepEqual(keys("implement", null), ["report-failure", "short-commits"]);
  assert.deepEqual(keys("implement", "bugfix"), ["only-bugfix", "report-failure", "short-commits"]);
  assert.deepEqual(keys("implement", "feature"), ["report-failure", "short-commits"]);
  assert.deepEqual(keys("investigate", null), ["short-commits"]);
  assert.deepEqual(keys("reviewerComments", "bugfix"), []);
});

test("a memory is one bullet, with its reason when it has one", () => {
  const [bugfix, plain] = currentMemories(store(), REPO);
  assert.equal(memoryBullet(bugfix!), "- When a test fails for an unrelated reason: Stop and report it (it wastes time)");
  assert.equal(memoryBullet(plain!), "- When a test fails for an unrelated reason: Stop and report it");
});

test("memory problems name each invalid field", () => {
  const { source: _source, ...valid } = memory();
  assert.deepEqual(memoryProblems(valid), []);
  assert.deepEqual(memoryProblems({ ...valid, situation: " ", why: "", phases: [], kinds: ["other"] }), ["situation must be a non-empty string", "why must be null or a non-empty string", "phases must not be empty", "kinds must be a list of bugfix, feature, spec, refactor, perf"]);
  assert.deepEqual(memoryProblems({ ...valid, phases: ["review"] }), ["phases must be a list of investigate, implement, reviewerComments"]);
  assert.deepEqual(memoryProblems(null), ["memory must be an object"]);
});

test("a distillation adds new keys and updates existing ones, with a slug", () => {
  const existing = currentMemories(store(), REPO);
  const { source: _source, ...valid } = memory();
  const reply = (over: Partial<DistillReply>): DistillReply => ({ action: "add", key: "name-helpers", scope: "repo", memory: valid, ...over });
  assert.deepEqual(distillProblems(reply({}), existing), []);
  assert.deepEqual(distillProblems(reply({ action: "update", key: "report-failure" }), existing), []);
  assert.deepEqual(distillProblems(reply({ action: "update" }), existing), ["update needs an existing memory; name-helpers is not one in repo scope"]);
  assert.deepEqual(distillProblems(reply({ key: "report-failure" }), existing), ["report-failure exists in repo scope; use update"]);
  assert.deepEqual(distillProblems(reply({ key: "report-failure", scope: "global" }), existing), []);
  assert.deepEqual(distillProblems(reply({ key: "No Spaces" }), existing), ["key must match ^[a-z0-9-]{3,60}$"]);
});

test("memory sections are the bullets of the relevant memories, recorded as UsedMemories; none without memories", () => {
  const knowledge = store();
  const put: { type: string; status: string; data: unknown }[] = [];
  const ctx = { knowledge, repoDir: REPO, artifacts: { put: (type: string, status: string, data: unknown) => { put.push({ type, status, data }); return {}; } } } as unknown as Pick<TaskContext, "knowledge" | "repoDir" | "artifacts">;
  assert.deepEqual(memorySections(ctx, "implement", "bugfix"), ["# How this user wants things done", "- When a test fails for an unrelated reason: Stop and report it (it wastes time)\n- When a test fails for an unrelated reason: Stop and report it\n- When a test fails for an unrelated reason: Stop and report it"]);
  assert.deepEqual(put.map((p) => [p.type, p.status, (p.data as { entries: { scope: string; key: string }[] }).entries.map((e) => `${e.scope}/${e.key}`)]), [["UsedMemories", "verified", ["repo/only-bugfix", "repo/report-failure", "global/short-commits"]]]);
  put.length = 0;
  assert.deepEqual(memorySections(ctx, "reviewerComments", null), []);
  assert.deepEqual(put, []);
});
