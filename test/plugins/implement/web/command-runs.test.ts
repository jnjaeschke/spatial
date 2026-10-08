import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, SessionState } from "../../../../src/web/plugin-api.ts";
import { chipLabel, chipStatus, commandChips, implementSummary } from "../../../../src/plugins/implement/web/command-runs.ts";

let k = 0;
const art = (type: string, data: unknown, epoch: number | null): Artifact => ({ id: `${type}${++k}`, sessionId: "s", type, status: "verified", data, provenance: { taskId: "t" }, epoch, createdAt: "" });
const run = (command: string, exitCode: number, epoch: number | null, test = false) => art("CommandRun", { command, exitCode, durationMs: 5, output: `out of ${command}`, test }, epoch);
const state = (artifacts: Artifact[]): SessionState => ({ session: { id: "s", worktree: "/r", repoDir: "/r/.git", title: "t", createdAt: "", workflow: "implement" }, artifacts, links: [], tasks: [], epochs: [], lastEventId: 0, searchfox: null });

test("chips are the command runs of one epoch, in order", () => {
  const s = state([run("a", 0, 2), run("b", 1, 2, true), run("c", 0, 4)]);
  assert.deepEqual(commandChips(s, 2).map((c) => [c.command, c.test]), [["a", false], ["b", true]]);
  assert.deepEqual(commandChips(s, 3), []);
  assert.equal(commandChips(s, 4)[0]!.output, "out of c");
});

test("a chip passes on exit code 0 and is labelled by a shortened command", () => {
  assert.equal(chipStatus({ id: "x", command: "a", exitCode: 0, durationMs: 1, output: "", test: false }), "pass");
  assert.equal(chipStatus({ id: "x", command: "a", exitCode: 2, durationMs: 1, output: "", test: false }), "fail");
  assert.equal(chipLabel({ id: "x", command: "./mach test dom/base/test/very/long/path/that/goes/on/and/on", exitCode: 0, durationMs: 1, output: "", test: true }).length, 40);
  assert.equal(chipLabel({ id: "x", command: "ls", exitCode: 0, durationMs: 1, output: "", test: false }), "ls");
});

test("the summary is the implement result of the epoch", () => {
  const s = state([art("ImplementResult", { head: "h", branch: "b", summary: "Did it.", planChange: null, planInvalid: null }, 2)]);
  assert.equal(implementSummary(s, 2), "Did it.");
  assert.equal(implementSummary(s, 3), null);
  const invalid = state([art("ImplementResult", { head: "h", branch: "b", summary: "Stopped.", planChange: null, planInvalid: "no API" }, 2)]);
  assert.equal(implementSummary(invalid, 2), "Plan does not hold: no API");
});
