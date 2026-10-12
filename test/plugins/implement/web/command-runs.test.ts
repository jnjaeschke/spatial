import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, SessionState } from "../../../../src/web/plugin-api.ts";
import { commandRunLog, commandSummary, commandSummaryLabel, implementSummary } from "../../../../src/plugins/implement/web/command-runs.ts";

let k = 0;
const art = (type: string, data: unknown, epoch: number | null): Artifact => ({ id: `${type}${++k}`, sessionId: "s", type, status: "verified", data, provenance: { taskId: "t" }, epoch, createdAt: "" });
const run = (command: string, exitCode: number, epoch: number | null, test = false) => art("CommandRun", { command, exitCode, durationMs: 5, output: `out of ${command}`, test }, epoch);
const state = (artifacts: Artifact[]): SessionState => ({ session: { id: "s", worktree: "/r", repoDir: "/r/.git", title: "t", createdAt: "", workflow: "implement" }, artifacts, links: [], tasks: [], epochs: [], lastEventId: 0, searchfox: null });

test("the command summary counts the runs of one epoch and names the task that ran them", () => {
  const s = state([run("a", 0, 2), run("b", 1, 2, true), run("c", 0, 4)]);
  assert.deepEqual(commandSummary(s, 2), { count: 2, failed: 1, taskId: "t" });
  assert.equal(commandSummary(s, 3), null);
  assert.equal(commandSummaryLabel({ count: 14, failed: 2 }), "14 commands, 2 failed");
  assert.equal(commandSummaryLabel({ count: 1, failed: 0 }), "1 command, 0 failed");
});

test("a command run opens its tool call in its task's log", () => {
  const withCall = { ...run("a", 0, 2), data: { command: "a", exitCode: 0, durationMs: 1, output: "", test: false, callId: "toolu_1" } };
  const own = run("b", 0, 2);
  const s = state([withCall, own]);
  assert.deepEqual(commandRunLog(s, withCall.id), { taskId: "t", callId: "toolu_1" });
  assert.deepEqual(commandRunLog(s, own.id), { taskId: "t" });
  assert.equal(commandRunLog(s, "nope"), null);
});

test("the summary is the implement result of the epoch", () => {
  const s = state([art("ImplementResult", { head: "h", branch: "b", summary: "Did it.", planChange: null, planInvalid: null }, 2)]);
  assert.equal(implementSummary(s, 2), "Did it.");
  assert.equal(implementSummary(s, 3), null);
  const invalid = state([art("ImplementResult", { head: "h", branch: "b", summary: "Stopped.", planChange: null, planInvalid: "no API" }, 2)]);
  assert.equal(implementSummary(invalid, 2), "Plan does not hold: no API");
});
