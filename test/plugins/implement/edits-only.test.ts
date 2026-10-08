import { test } from "node:test";
import assert from "node:assert/strict";
import { runEditsOnly, type EditsOnlyOptions } from "../../../src/plugins/implement/runtime/edits-only.ts";

function fakes(over: { checks?: number[]; paths?: string[][]; commits?: { sha: string; subject: string }[]; replies?: Partial<{ step: number | null; planInvalid: string | null }>[] } = {}) {
  const log: string[] = [];
  let check = 0, edit = 0, reply = 0;
  const options: EditsOnlyOptions = {
    plan: [{ message: "Add test" }, { message: "Fix it" }], baseSha: "base", bugfix: true, maxRetries: 1,
    checkCommand: (paths) => `check ${paths.join(",")}`,
    async runCheck(command) { log.push(`run ${command}`); return { exitCode: (over.checks ?? [1, 0])[check++] ?? 0, output: "out" }; },
    async agent({ step, problems }) { log.push(`agent ${step}${problems.length ? ` [${problems.join("|")}]` : ""}`); return { summary: "s", planChange: null, planInvalid: null, step: null, ...(over.replies ?? [])[reply++] }; },
    git: {
      async changedPaths() { return (over.paths ?? [["t.cpp"], ["f.cpp"]])[edit++] ?? []; },
      async commitAll(message) { log.push(`commit ${message}`); return "sha"; },
      async fixup(target, base) { log.push(`fixup ${target} ${base}`); return "tip"; },
      async commits() { return over.commits ?? []; },
    },
  };
  return { options, log };
}

test("a bug fix commits the failing test first, then the fix, running the check each time", async () => {
  const { options, log } = fakes();
  await runEditsOnly(options);
  assert.deepEqual(log, ["agent 0", "run check t.cpp", "commit Add test", "agent 1", "run check f.cpp", "commit Fix it"]);
});

test("the first step of a bug fix must fail the check before the fix", async () => {
  const { options, log } = fakes({ checks: [0, 1, 0], paths: [["t.cpp"], ["t.cpp"], ["f.cpp"]] });
  await runEditsOnly(options);
  assert.ok(log.includes("agent 0 [The new test must fail before the fix; the check passed]"));
  assert.equal(log.filter((line) => line.startsWith("commit")).length, 2);
});

test("a later step must pass the check; exhausted retries fail with the reason", async () => {
  const { options } = fakes({ checks: [1, 1, 1], paths: [["t.cpp"], ["f.cpp"], ["f.cpp"]] });
  await assert.rejects(runEditsOnly(options), /Step 2 still fails after 1 retries: The check failed/);
});

test("a step without file changes is a problem", async () => {
  const { options, log } = fakes({ paths: [[], ["t.cpp"], ["f.cpp"]], checks: [1, 0] });
  await runEditsOnly(options);
  assert.ok(log.includes("agent 0 [You made no file changes]"));
});

test("a single-step plan is not a test-first plan", async () => {
  const { options, log } = fakes({ checks: [0], paths: [["f.cpp"]] });
  await runEditsOnly({ ...options, plan: [{ message: "Only" }] });
  assert.deepEqual(log, ["agent 0", "run check f.cpp", "commit Only"]);
});

test("with a stack present the agent names the commit and the change is fixed up into it", async () => {
  const { options, log } = fakes({ commits: [{ sha: "c1", subject: "A" }, { sha: "c2", subject: "B" }], replies: [{ step: 1 }], checks: [0], paths: [["f.cpp"]] });
  await runEditsOnly(options);
  assert.deepEqual(log, ["agent null", "run check f.cpp", "fixup c2 base"]);
});

test("naming no or an unknown commit in a fix round is a problem", async () => {
  const { options, log } = fakes({ commits: [{ sha: "c1", subject: "A" }], replies: [{ step: null }, { step: 5 }, { step: 0 }], checks: [0], paths: [["f.cpp"]] });
  await assert.rejects(runEditsOnly({ ...options, maxRetries: 1 }), /still fails/);
  assert.ok(log.some((line) => line.includes("Name the commit")));
});

test("a plan that does not hold stops the run without committing", async () => {
  const { options, log } = fakes({ replies: [{ planInvalid: "no such API" }] });
  assert.equal((await runEditsOnly(options)).planInvalid, "no such API");
  assert.deepEqual(log, ["agent 0"]);
});
