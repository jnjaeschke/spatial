import { test } from "node:test";
import assert from "node:assert/strict";
import { testFirstProblems } from "../../../src/plugins/implement/runtime/test-first.ts";

const plan = [{ title: "Add test", tests: ["x/test_a.js", "test_b.js"] }];
const profile = { isTestCommand: (command: string) => command.startsWith("t ") };
const run = (command: string, exitCode: number) => ({ command, exitCode });

test("only passing runs mean the test never failed", () => {
  assert.match(testFirstProblems(plan, [run("t x/test_a.js", 0)], profile)[0]!, /every run passed/);
  assert.match(testFirstProblems(plan, [run("t x/test_a.js", 1)], profile)[0]!, /followed by a passing run/);
  assert.match(testFirstProblems(plan, [run("t x/test_a.js", 1), run("t x/test_a.js", 0), run("t x/test_a.js", 1)], profile)[0]!, /last run must pass/);
});

test("without test runs naming the test there is no evidence", () => {
  assert.match(testFirstProblems(plan, [], profile)[0]!, /no run of a test command/);
  assert.equal(testFirstProblems(plan, [run("t other/test_c.js", 1), run("ls x/test_a.js", 0), run("git status x/test_a.js", 1)], profile).length, 1);
});

test("a profile without isTestCommand and steps without tests are skipped", () => {
  assert.deepEqual(testFirstProblems(plan, [], {}), []);
  assert.deepEqual(testFirstProblems([{ title: "Fix", tests: [] }], [], profile), []);
});
