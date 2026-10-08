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
