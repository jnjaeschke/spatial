import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEvidence, type CommandEvidence } from "../../../src/plugins/implement/runtime/check-evidence.ts";
import type { AcceptanceCheck } from "../../../src/plugins/implement/shared/types.ts";

const profile = { isTestCommand: (command: string) => command.startsWith("t ") };
let n = 0;
const run = (command: string, exitCode: number, edited = false): CommandEvidence => ({ id: `r${++n}`, command, exitCode, edited });
const plan = (...checks: AcceptanceCheck[]) => [{ title: "Step", checks }];
const first = (checks: AcceptanceCheck[], runs: CommandEvidence[]) => checkEvidence(plan(...checks), runs, { first: true, profile });
const later = (checks: AcceptanceCheck[], runs: CommandEvidence[]) => checkEvidence(plan(...checks), runs, { first: false, profile });
const newTest: AcceptanceCheck = { kind: "new-test", path: "x/test_a.js" };
const covering: AcceptanceCheck = { kind: "covering-test", path: "x/test_c.js" };
const failing: AcceptanceCheck = { kind: "failing-test", path: "x/test_f.js", subtests: [] };
const wpt: AcceptanceCheck = { kind: "failing-test", path: "testing/web-platform/tests/dom/a.html", subtests: ["s"] };
const measure: AcceptanceCheck = { kind: "measure", command: "bench", goal: "faster" };

test("a new test must fail, then pass, and end passing", () => {
  assert.match(first([newTest], [run("t x/test_a.js", 0)]).problems[0]!, /every run passed/);
  assert.match(first([newTest], [run("t x/test_a.js", 1)]).problems[0]!, /last run failed/);
  assert.match(first([newTest], [run("t x/test_a.js", 1), run("t x/test_a.js", 0), run("t x/test_a.js", 1)]).problems[0]!, /last run failed/);
  assert.match(first([newTest], []).problems[0]!, /no run of a test command naming the test/);
  assert.deepEqual(first([newTest], [run("t x/test_a.js", 1), run("t x/test_a.js", 0)]).problems, []);
});

test("only test commands naming the path count", () => {
  const runs = [run("t other/test_c.js", 1), run("ls x/test_a.js", 0), run("git status x/test_a.js", 1)];
  assert.equal(first([newTest], runs).problems.length, 1);
  assert.deepEqual(first([newTest], runs).results[0]!.runs, []);
});

test("a failing test must end passing; outside web-platform it must also have failed first", () => {
  assert.match(first([failing], [run("t x/test_f.js", 0)]).problems[0]!, /no failing run before the first passing run/);
  assert.match(first([failing], [run("t x/test_f.js", 0), run("t x/test_f.js", 1), run("t x/test_f.js", 0)]).problems[0]!, /no failing run before the first passing run/);
  assert.match(first([failing], [run("t x/test_f.js", 1)]).problems[0]!, /last run failed/);
  assert.deepEqual(first([failing], [run("t x/test_f.js", 1), run("t x/test_f.js", 0)]).problems, []);
  assert.deepEqual(first([wpt], [run("t testing/web-platform/tests/dom/a.html", 0)]).problems, []);
  assert.match(first([wpt], []).problems[0]!, /no run of a test command/);
});

test("a covering test needs a run and must end passing", () => {
  assert.match(first([covering], []).problems[0]!, /run it after your change/);
  assert.match(first([covering], [run("t x/test_c.js", 1)]).problems[0]!, /last run failed/);
  assert.deepEqual(first([covering], [run("t x/test_c.js", 0)]).problems, []);
});

test("a measure never produces a problem; its result lists the runs found", () => {
  const before = run("bench", 0, false), after = run("bench", 0, true);
  const both = first([measure], [before, after]);
  assert.deepEqual(both.problems, []);
  assert.deepEqual(both.results, [{ step: 0, check: 0, label: "measure `bench` - faster", ok: true, message: "2 runs: before and after the first edit", runs: [before.id, after.id] }]);
  assert.equal(first([measure], [after]).results[0]!.message, "1 run");
  assert.equal(first([measure], [before, before]).results[0]!.message, "2 runs");
  const none = later([measure], []);
  assert.deepEqual(none.problems, []);
  assert.deepEqual(none.results.map((r) => [r.ok, r.message, r.runs]), [[false, "not run", []]]);
  assert.deepEqual(first([measure], []).problems, []);
});

test("later epochs need evidence only for what ran in the epoch", () => {
  assert.deepEqual(later([newTest, failing, covering], []).problems, []);
  assert.match(later([newTest], [run("t x/test_a.js", 0), run("t x/test_a.js", 1)]).problems[0]!, /last run failed/);
  assert.deepEqual(later([newTest], [run("t x/test_a.js", 1), run("t x/test_a.js", 0)]).problems, []);
});

test("results name every judged check with its proving runs", () => {
  const a = run("t x/test_a.js", 1), b = run("t x/test_a.js", 0);
  const { results, problems } = checkEvidence([{ title: "S0", checks: [newTest] }, { title: "S1", checks: [covering] }], [a, b], { first: true, profile });
  assert.deepEqual(results, [
    { step: 0, check: 0, label: "new-test x/test_a.js", ok: true, message: "2 runs, the last passed", runs: [a.id, b.id] },
    { step: 1, check: 0, label: "covering-test x/test_c.js", ok: false, message: "no run of a test command naming the test was recorded; run it after your change (it must pass)", runs: [] },
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /^Step "S1", covering-test x\/test_c\.js: no run/);
});

test("a profile without isTestCommand skips test checks but still reports measures", () => {
  const out = checkEvidence(plan(newTest, measure), [], { first: true, profile: {} });
  assert.deepEqual(out.results.map((r) => r.label), ["measure `bench` - faster"]);
  assert.deepEqual(out.problems, []);
});
