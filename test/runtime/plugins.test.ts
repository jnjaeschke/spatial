import { test } from "node:test";
import assert from "node:assert/strict";
import { artifactKinds, pluginRegistry, searchKinds, type Plugin } from "../../src/runtime/plugins.ts";

test("plugin registries reject duplicate ids and merge artifact/search kinds", () => {
  const a: Plugin = { id: "a", workflows: [{ id: "one" } as never], tasks: [{ kind: "task" } as never], artifactKinds: { Extra: {} }, searchKinds: ["extra"], chatReplyFields: [{ name: "field" } as never] };
  const b: Plugin = { id: "b", workflows: [{ id: "two" } as never], tasks: [{ kind: "other" } as never], artifactKinds: { More: {} }, searchKinds: ["more"], chatReplyFields: [{ name: "other" } as never] };
  const registry = pluginRegistry([a, b]);
  assert.deepEqual([...registry.workflows.keys()], ["one", "two"]);
  assert.deepEqual([...registry.tasks.keys()], ["task", "other"]);
  assert.deepEqual(searchKinds([a, b]), ["chat", "note", "extra", "more"]);
  assert.deepEqual(Object.keys(artifactKinds([a, b])), ["Note", "WorkflowStart", "ChatThread", "ChatMessage", "Extra", "More"]);

  assert.throws(() => pluginRegistry([a, { ...b, workflows: [{ id: "one" } as never] }]), /Duplicate workflow id: one/);
  assert.throws(() => pluginRegistry([a, { ...b, tasks: [{ kind: "task" } as never] }]), /Duplicate task kind: task/);
  assert.throws(() => pluginRegistry([a, { ...b, artifactKinds: { Extra: {} } }]), /Duplicate artifact kind: Extra/);
  assert.throws(() => pluginRegistry([a, { ...b, chatReplyFields: [{ name: "field" } as never] }]), /Duplicate chat reply field: field/);
});

test("plugin dependencies must be registered and acyclic", () => {
  const a: Plugin = { id: "a", dependsOn: ["b"] }, b: Plugin = { id: "b" }, c: Plugin = { id: "c", dependsOn: ["a", "b"] };
  assert.doesNotThrow(() => pluginRegistry([c, a, b]));
  assert.throws(() => pluginRegistry([a]), /Plugin a depends on b, which is not registered/);
  assert.throws(() => pluginRegistry([{ id: "a", dependsOn: ["b"] }, { id: "b", dependsOn: ["c"] }, { id: "c", dependsOn: ["a"] }]), /Plugin dependency cycle: a -> b -> c -> a/);
  assert.throws(() => pluginRegistry([{ id: "a", dependsOn: ["a"] }]), /Plugin dependency cycle: a -> a/);
});
