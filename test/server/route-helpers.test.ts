import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError, llmField, startTask, text } from "../../src/server/http.ts";
import type { Runtime } from "../../src/runtime/tasks.ts";

test("text returns a non-blank string field and names the label otherwise", () => {
  assert.equal(text({ body: " hi " }, "body"), " hi ");
  assert.throws(() => text({ body: "  " }, "body", "Comment body"), (e: unknown) => e instanceof HttpError && e.status === 400 && e.message === "Comment body must not be blank");
  assert.throws(() => text({}, "body"), (e: unknown) => e instanceof HttpError && e.message === "Missing string field: body");
});

test("llmField accepts an absent field or a full selection", () => {
  assert.equal(llmField({}), undefined);
  assert.deepEqual(llmField({ llm: { backend: "codex", model: "m", effort: "low", extra: 1 } }), { backend: "codex", model: "m", effort: "low" });
  for (const llm of [null, "claude", { backend: "other", model: "m", effort: "low" }, { backend: "claude", model: 1, effort: "low" }]) {
    assert.throws(() => llmField({ llm }), (e: unknown) => e instanceof HttpError && e.status === 400 && e.message === "llm must be { backend, model, effort }");
  }
});

test("startTask returns the task id and logs a failure instead of rejecting", async () => {
  const errors: string[] = [];
  const original = console.error;
  console.error = (message: string) => { errors.push(message); };
  try {
    let fail!: (e: Error) => void;
    const rt = { start: () => ({ taskId: "T1", done: new Promise((_, reject) => { fail = reject; }) }) } as unknown as Runtime;
    assert.equal(startTask(rt, "S", "comment", {}), "T1");
    fail(new Error("boom"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(errors, ["comment T1 failed: boom"]);
  } finally { console.error = original; }
});
