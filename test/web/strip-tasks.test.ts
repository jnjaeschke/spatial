import { test } from "node:test";
import assert from "node:assert/strict";
import type { TaskRecord } from "../../src/shared/types.ts";
import { stripTasks } from "../../src/web/strip-tasks.ts";

const task = (id: string, kind: string, parentId: string | null = null) => ({ id, kind, parentId }) as TaskRecord;

test("the strip leaves out chat turns, their descendants and the kinds plugins show in the conversation", () => {
  const tasks = [task("a", "narrate"), task("t", "chatTurn"), task("c", "lookup", "t"), task("g", "deep", "c"), task("d", "distillSteer"), task("b", "review")];
  assert.deepEqual(stripTasks(tasks, new Set(["distillSteer"])).map((t) => t.id), ["a", "b"]);
});

test("a child of a task the strip shows stays", () => {
  const tasks = [task("p", "review"), task("c", "lookup", "p")];
  assert.deepEqual(stripTasks(tasks, new Set()).map((t) => t.id), ["p", "c"]);
});
