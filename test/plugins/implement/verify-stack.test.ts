import { test } from "node:test";
import assert from "node:assert/strict";
import type { Commit } from "../../../src/plugin-api.ts";
import { verifyStack, type StackCheck } from "../../../src/plugins/implement/runtime/verify-stack.ts";

const git = (o: { ancestor?: boolean; dirty?: boolean; commits?: Commit[] } = {}) => ({ resolve: async () => "h".repeat(40), isAncestor: async () => o.ancestor ?? true, isDirty: async () => o.dirty ?? false, log: async () => o.commits ?? [] });
const commit = (subject: string): Commit => ({ sha: "c".repeat(40), subject, body: "" });
const check = (over: Partial<StackCheck> = {}): StackCheck => ({ baseSha: "b".repeat(40), branch: "spatial/x", plan: null, planChange: null, profile: { commitStyle: "stack" }, ...over });

test("a clean stack on the branch has no problems", async () => {
  const r = await verifyStack(git({ commits: [commit("One")] }), "spatial/x", check());
  assert.deepEqual(r, { head: "h".repeat(40), problems: [] });
});

test("branch, ancestry, commits and a dirty tree are reported", async () => {
  assert.match((await verifyStack(git({ commits: [commit("One")] }), "other", check())).problems[0]!, /not on spatial\/x/);
  assert.match((await verifyStack(git({ ancestor: false }), "spatial/x", check())).problems[0]!, /no longer descends/);
  assert.match((await verifyStack(git(), "spatial/x", check())).problems[0]!, /no commits/);
  assert.match((await verifyStack(git({ commits: [commit("One")], dirty: true }), "spatial/x", check())).problems[0]!, /uncommitted/);
});

test("a single-commit profile rejects more than one commit", async () => {
  const r = await verifyStack(git({ commits: [commit("A"), commit("B")] }), "spatial/x", check({ profile: { commitStyle: "single" } }));
  assert.match(r.problems[0]!, /single commit, found 2/);
});

test("the stack must match the plan by count and subject unless a plan change was reported", async () => {
  const plan = [{ message: "Bug N - Add test" }, { message: "Bug N - Fix it" }];
  assert.deepEqual((await verifyStack(git({ commits: [commit("Bug 5 - Add test"), commit("Bug 5 - Fix it r?alice")] }), "spatial/x", check({ plan }))).problems, []);
  assert.match((await verifyStack(git({ commits: [commit("Bug 5 - Add test")] }), "spatial/x", check({ plan }))).problems[0]!, /2 steps but the branch has 1/);
  assert.match((await verifyStack(git({ commits: [commit("Bug 5 - Add test"), commit("Bug 5 - Something else")] }), "spatial/x", check({ plan }))).problems[0]!, /Commit 2/);
  assert.deepEqual((await verifyStack(git({ commits: [commit("Bug 5 - Only one")] }), "spatial/x", check({ plan, planChange: "merged the steps" }))).problems, []);
});

test("every commit subject passes the profile's message check", async () => {
  const profile = { commitStyle: "stack" as const, messageCheck: (m: string) => m.startsWith("Bug") ? null : "needs a bug" };
  const r = await verifyStack(git({ commits: [commit("Bug 1 - ok"), commit("nope")] }), "spatial/x", check({ profile }));
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0]!, /"nope": needs a bug/);
});
