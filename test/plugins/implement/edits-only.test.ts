import { test } from "node:test";
import assert from "node:assert/strict";
import { runEditsOnly, type EditsOnlyOptions } from "../../../src/plugins/implement/runtime/edits-only.ts";
import type { CheckResult } from "../../../src/plugins/implement/shared/types.ts";

const PLAN: EditsOnlyOptions["plan"] = [
  { message: "Add test", checks: [{ kind: "new-test", path: "t.js" }] },
  { message: "Fix it", checks: [{ kind: "covering-test", path: "c.js" }, { kind: "measure", command: "bench", goal: "faster" }] },
];

function fakes(over: { exits?: Record<string, number[]>; paths?: string[][]; commits?: { sha: string; subject: string }[]; replies?: Partial<{ step: number | null; planInvalid: string | null }>[]; plan?: EditsOnlyOptions["plan"]; build?: boolean } = {}) {
  const log: string[] = [];
  const seen = new Map<string, number>();
  const reports: CheckResult[][] = [];
  let edit = 0, reply = 0, ids = 0;
  const options: EditsOnlyOptions = {
    plan: over.plan ?? PLAN, baseSha: "base", bugfix: true, maxRetries: 1,
    ...(over.build === false ? {} : { buildCommand: "build" }),
    testCommand: (paths) => `test ${paths.join(",")}`,
    async runCheck(command) {
      log.push(`run ${command}`);
      const count = seen.get(command) ?? 0;
      seen.set(command, count + 1);
      return { id: `c${++ids}`, exitCode: over.exits?.[command]?.[count] ?? 0, output: "out" };
    },
    onResults(results) { reports.push(results); },
    async agent({ step, problems }) { log.push(`agent ${step}${problems.length ? ` [${problems.join("|")}]` : ""}`); return { summary: "s", planChange: null, planInvalid: null, step: null, ...(over.replies ?? [])[reply++] }; },
    git: {
      async changedPaths() { return (over.paths ?? [["t.cpp"], ["f.cpp"]])[edit++] ?? []; },
      async commitAll(message) { log.push(`commit ${message}`); return "sha"; },
      async fixup(target, base) { log.push(`fixup ${target} ${base}`); return "tip"; },
      async commits() { return over.commits ?? []; },
    },
  };
  return { options, log, reports };
}

test("a bug fix commits the failing test first, then the fix; each step builds and runs its test checks", async () => {
  const { options, log } = fakes({ exits: { "test t.js": [1] } });
  await runEditsOnly(options);
  assert.deepEqual(log, ["agent 0", "run build", "run test t.js", "commit Add test", "agent 1", "run build", "run test c.js", "commit Fix it"]);
});

test("the step that adds the new test must fail its test run", async () => {
  const { options, log } = fakes({ exits: { "test t.js": [0, 1] }, paths: [["t.cpp"], ["t.cpp"], ["f.cpp"]] });
  await runEditsOnly(options);
  assert.ok(log.includes("agent 0 [The new test must fail before the fix; the check passed]"));
  assert.equal(log.filter((line) => line.startsWith("commit")).length, 2);
});

test("a failing build is a problem of its own, never the expected failure", async () => {
  const { options, log } = fakes({ exits: { build: [1, 0], "test t.js": [1] }, paths: [["t.cpp"], ["t.cpp"], ["f.cpp"]] });
  await runEditsOnly(options);
  assert.ok(log.includes("agent 0 [The build failed:\nout]"));
  assert.equal(log.indexOf("run test t.js"), log.indexOf("agent 0 [The build failed:\nout]") + 2);
});

test("each attempt reports check results from the runs the runtime made", async () => {
  const { options, reports } = fakes({ exits: { build: [1, 0], "test t.js": [1] }, paths: [["t.cpp"], ["t.cpp"], ["f.cpp"]] });
  await runEditsOnly(options);
  assert.deepEqual(reports[0], [{ step: 0, check: 0, label: "new-test t.js", ok: false, message: "The build failed", runs: ["c1"] }]);
  assert.deepEqual(reports[1], [{ step: 0, check: 0, label: "new-test t.js", ok: true, message: "failed before the fix, as expected", runs: ["c3"] }]);
  assert.deepEqual(reports.at(-1), [
    { step: 0, check: 0, label: "new-test t.js", ok: true, message: "failed before the fix, as expected", runs: ["c3"] },
    { step: 1, check: 0, label: "covering-test c.js", ok: true, message: "passed", runs: ["c5"] },
    { step: 1, check: 1, label: "measure `bench` - faster", ok: false, message: "not run in edits-only mode", runs: [] },
  ]);
});

test("a later step must pass its tests; exhausted retries fail with the reason", async () => {
  const { options } = fakes({ exits: { "test t.js": [1], "test c.js": [1, 1] }, paths: [["t.cpp"], ["f.cpp"], ["f.cpp"]] });
  await assert.rejects(runEditsOnly(options), /Step 2 still fails after 1 retries: The tests failed/);
});

test("a step without file changes is a problem", async () => {
  const { options, log } = fakes({ paths: [[], ["t.cpp"], ["f.cpp"]], exits: { "test t.js": [1] } });
  await runEditsOnly(options);
  assert.ok(log.includes("agent 0 [You made no file changes]"));
});

test("a single-step plan is not a test-first plan", async () => {
  const { options, log } = fakes({ plan: [{ message: "Only", checks: [{ kind: "new-test", path: "t.js" }] }], paths: [["f.cpp"]] });
  await runEditsOnly(options);
  assert.deepEqual(log, ["agent 0", "run build", "run test t.js", "commit Only"]);
});

test("a step without test checks only builds, and measures are not run", async () => {
  const { options, log } = fakes({ plan: [{ message: "A", checks: [] }, { message: "B", checks: [{ kind: "measure", command: "bench", goal: "faster" }] }], paths: [["a.cpp"], ["b.cpp"]] });
  await runEditsOnly(options);
  assert.deepEqual(log, ["agent 0", "run build", "commit A", "agent 1", "run build", "commit B"]);
});

test("without a build command only the tests run", async () => {
  const { options, log } = fakes({ build: false, exits: { "test t.js": [1] } });
  await runEditsOnly(options);
  assert.ok(!log.includes("run build"));
});

test("with a stack present the agent names the commit; the fix round builds, runs the whole plan's tests and fixes up", async () => {
  const { options, log } = fakes({ commits: [{ sha: "c1", subject: "A" }, { sha: "c2", subject: "B" }], replies: [{ step: 1 }], paths: [["f.cpp"]] });
  await runEditsOnly(options);
  assert.deepEqual(log, ["agent null", "run build", "run test t.js,c.js", "fixup c2 base"]);
});

test("naming no or an unknown commit in a fix round is a problem", async () => {
  const { options, log } = fakes({ commits: [{ sha: "c1", subject: "A" }], replies: [{ step: null }, { step: 5 }, { step: 0 }], paths: [["f.cpp"]] });
  await assert.rejects(runEditsOnly({ ...options, maxRetries: 1 }), /still fails/);
  assert.ok(log.some((line) => line.includes("Name the commit")));
});

test("a plan that does not hold stops the run without committing", async () => {
  const { options, log } = fakes({ replies: [{ planInvalid: "no such API" }] });
  assert.equal((await runEditsOnly(options)).planInvalid, "no such API");
  assert.deepEqual(log, ["agent 0"]);
});
