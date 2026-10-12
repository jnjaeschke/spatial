import { test } from "node:test";
import assert from "node:assert/strict";
import { activityRows, duration } from "../../src/web/activity-rows.ts";

test("a tool call and its result are one row, wherever the result arrives", () => {
  const rows = activityRows([
    { kind: "text", text: "go" },
    { kind: "tool", name: "Bash", detail: "ls", callId: "a" },
    { kind: "tool", name: "Bash", detail: "false", callId: "b" },
    { kind: "tool-result", callId: "b", exitCode: 1, durationMs: 5, output: "Exit code 1" },
    { kind: "tool-result", callId: "a", exitCode: 0, durationMs: 9, output: "x" },
  ]);
  assert.deepEqual(rows.map((r) => r.kind), ["text", "tool", "tool"]);
  assert.deepEqual(rows.map((r) => r.kind === "tool" && r.result?.exitCode), [false, 0, 1]);
});

test("a call without a result stays a plain row and a result without its call is dropped", () => {
  const rows = activityRows([
    { kind: "tool", name: "web search", detail: "q" },
    { kind: "tool", name: "Bash", detail: "sleep 9", callId: "a" },
    { kind: "tool-result", callId: "gone", exitCode: 0, durationMs: 1, output: "" },
  ]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.kind === "tool" && r.result === null));
});

test("durations read as ms below a second, then seconds, then minutes", () => {
  assert.deepEqual([duration(12), duration(1234), duration(59_900), duration(125_000)], ["12 ms", "1.2 s", "59.9 s", "2 m 5 s"]);
});
