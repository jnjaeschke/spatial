import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeRepo } from "../../helpers/git-fixture.ts";
import { testRuntime } from "../../helpers/runtime.ts";
import { makeGit } from "../../../src/runtime/git/read.ts";
import { adoptBase, adoptRounds, relatedBranches } from "../../../src/plugins/implement/runtime/adopt.ts";
import type { AdoptPlanData } from "../../../src/plugins/implement/shared/types.ts";
import { implementPlugin } from "../../../src/plugins/implement/index.ts";
import { reviewPlugin } from "../../../src/plugins/review/index.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";

test("adoptBase picks the newest merge-base, so a stale origin ref does not pull in upstream commits", async () => {
  const repo = makeRepo();
  const old = repo.commit({ "a.txt": "1\n" }, "old main");
  repo.git("update-ref", "refs/remotes/origin/main", old);
  const fresh = repo.commit({ "a.txt": "2\n" }, "new main");
  repo.git("switch", "-q", "-c", "topic");
  const tip = repo.commit({ "b.txt": "b\n" }, "Bug 42 - part 1");
  assert.equal(await adoptBase(makeGit(repo.dir), ["origin/main", "refs/heads/main"], tip), fresh);
});

test("relatedBranches finds branches by bug number or patch id, skipping mainline", async () => {
  const repo = makeRepo();
  const base = repo.commit({ "a.txt": "a\n" }, "base");
  repo.git("switch", "-q", "-c", "renamed");
  repo.commit({ "b.txt": "b\n" }, "Bug 2072138, part 1 - thing");
  repo.git("switch", "-q", "-c", "same-patch", base);
  const change = repo.commit({ "c.txt": "c\n" }, "unrelated subject");
  repo.git("switch", "-q", "-c", "other", base);
  repo.commit({ "d.txt": "d\n" }, "Bug 1 - nope");
  repo.git("switch", "-q", "main");
  const git = makeGit(repo.dir), [known] = await git.patchIds(base, change);
  const found = await relatedBranches(git, await git.branches(), { refs: ["refs/heads/main"], bug: 2072138, knownPatchIds: new Set([known!.patchId]) });
  assert.deepEqual(found.sort(), ["renamed", "same-patch"]);
});

test("relatedBranches matches the bug only as a whole word", async () => {
  const repo = makeRepo();
  repo.commit({ "a.txt": "a\n" }, "base");
  repo.git("switch", "-q", "-c", "near");
  repo.commit({ "b.txt": "b\n" }, "Bug 20721389 - longer number");
  repo.git("switch", "-q", "main");
  assert.deepEqual(await relatedBranches(makeGit(repo.dir), await makeGit(repo.dir).branches(), { refs: ["refs/heads/main"], bug: 2072138, knownPatchIds: new Set() }), []);
});

function planSetup(repo: ReturnType<typeof makeRepo>) {
  const { rt, store, session } = testRuntime({ plugins: [specPlugin, reviewPlugin, implementPlugin], git: makeGit, session: { worktree: repo.dir, repoDir: join(repo.dir, ".git") } });
  const put = (type: string, data: unknown) => store.putArtifact({ sessionId: session.id, type, status: "verified", data, provenance: { taskId: "test" } });
  put("WorkflowStart", { via: "command", workflow: "implement", params: { request: "x" }, title: "test", prompt: "x" });
  put("ImplementBranch", { branch: "topic", baseSha: repo.git("rev-parse", "main"), baseRef: "main", checkout: "new-branch", profile: "plain" });
  put("Investigation", { kind: "bugfix", bug: null });
  return { rt, store, session, put };
}

test("adoptPlan records local commits without trailers and does not call Conduit", async () => {
  const repo = makeRepo(), base = repo.commit({ "a.txt": "a\n" }, "base");
  repo.git("switch", "-q", "-c", "topic");
  const tip = repo.commit({ "b.txt": "b\n" }, "local work");
  const { rt, store, session } = planSetup(repo);
  const { planId } = await rt.run<{ planId: string }>(session.id, "adoptPlan", { mode: "moved" });
  const plan = store.getArtifact<{ branches: { branch: string; base: string; tip: string; commits: unknown[] }[]; host: string | null; diffs: unknown[]; missingBases: string[]; refError: string | null; historyError: string | null }>(planId).data;
  assert.deepEqual(plan, { mode: "moved", host: null, branches: [{ branch: "topic", base, tip, commits: [{ sha: tip, subject: "local work", body: "" }] }], revisions: [], diffs: [], missingBases: [], refError: null, historyError: null });
});

test("adoptPlan writes a useful error when a chosen branch does not exist", async () => {
  const repo = makeRepo();
  repo.commit({ "a.txt": "a\n" }, "base");
  const { rt, store, session } = planSetup(repo);
  const { planId } = await rt.run<{ planId: string }>(session.id, "adoptPlan", { mode: "choose", ref: "nope" });
  const plan = store.getArtifact<{ branches: { branch: string }[]; refError: string | null }>(planId).data;
  assert.equal(plan.refError, "Branch nope does not exist");
  assert.deepEqual(plan.branches.map((branch) => branch.branch), ["main"]);
});

test("adoptPlan keeps the local plan when the Phabricator token is missing", async () => {
  const repo = makeRepo();
  repo.commit({ "a.txt": "a\n" }, "base");
  repo.git("switch", "-q", "-c", "topic");
  repo.commit({ "b.txt": "b\n" }, "work\n\nDifferential Revision: https://phab.example.com/D7");
  const arcrc = join(repo.dir, "arcrc"); writeFileSync(arcrc, JSON.stringify({ hosts: {} }));
  const old = process.env.SPATIAL_ARCRC_PATH; process.env.SPATIAL_ARCRC_PATH = arcrc;
  try {
    const { rt, store, session } = planSetup(repo);
    const { planId } = await rt.run<{ planId: string }>(session.id, "adoptPlan", { mode: "moved" });
    const plan = store.getArtifact<{ diffs: unknown[]; historyError: string | null }>(planId).data;
    assert.deepEqual(plan.diffs, []);
    assert.match(plan.historyError ?? "", /token/i);
  } finally {
    if (old === undefined) delete process.env.SPATIAL_ARCRC_PATH; else process.env.SPATIAL_ARCRC_PATH = old;
  }
});

const H = "https://phab.example.com";
const commit = (sha: string, rev?: number) => ({ sha, subject: `s ${sha}`, body: rev ? `Differential Revision: ${H}/D${rev}` : "" });
const roundPlan = (over: Partial<AdoptPlanData> = {}): AdoptPlanData => ({
  mode: "moved", host: H, refError: null, historyError: null, missingBases: [],
  branches: [{ branch: "topic", base: "BASE", tip: "c3", commits: [commit("c1", 1), commit("c2", 2), commit("c3")] }],
  revisions: [{ id: 1, title: "Part 1", latestDiffId: 20 }, { id: 2, title: "Part 2", latestDiffId: 21 }],
  diffs: [{ revision: 1, diffId: 10, base: "OLD", dateCreated: 0 }, { revision: 2, diffId: 11, base: "OLD", dateCreated: 5 }, { revision: 1, diffId: 20, base: "NEW", dateCreated: 9000 }, { revision: 2, diffId: 21, base: "NEW", dateCreated: 9005 }],
  ...over,
});

test("adoptRounds rebuilds earlier rounds and ends with the newest local diffs", () => {
  const rounds = adoptRounds(roundPlan(), { planId: "p", branch: "topic", head: "c2" });
  assert.equal(rounds.length, 2);
  assert.deepEqual(rounds[0], { round: { kind: "phabricator", host: H, stack: [
    { revision: 1, diffId: 10, base: "OLD", dateCreated: 0, title: "Part 1", latestDiffId: 20 },
    { revision: 2, diffId: 11, base: "OLD", dateCreated: 5, title: "Part 2", latestDiffId: 21 },
  ] }, narrate: false });
  assert.deepEqual(rounds[1]!.round.kind === "local" && rounds[1]!.round.phab?.map((e) => e.diffId), [20, 21]);
  assert.equal(rounds[1]!.narrate, true);
  assert.deepEqual(rounds[1]!.round.kind === "local" && [rounds[1]!.round.base, rounds[1]!.round.head], ["BASE", "c2"]);
});

test("adoptRounds includes only revisions with trailers in the adopted range", () => {
  const rounds = adoptRounds(roundPlan(), { planId: "p", branch: "topic", head: "c1" });
  assert.deepEqual(rounds.map((r) => r.round.kind === "phabricator" ? r.round.stack.map((e) => e.revision) : r.round.phab?.map((e) => e.revision)), [[1], [1]]);
});

test("adoptRounds skips rounds whose base is missing locally", () => {
  assert.equal(adoptRounds(roundPlan({ missingBases: ["OLD"] }), { planId: "p", branch: "topic", head: "c2" }).length, 1);
});

test("without trailers adoptRounds returns one local round without Phabricator diffs", () => {
  const rounds = adoptRounds(roundPlan({ host: null, revisions: [], diffs: [], branches: [{ branch: "topic", base: "BASE", tip: "c3", commits: [commit("c3")] }] }), { planId: "p", branch: "topic", head: "c3" });
  assert.deepEqual(rounds, [{ round: { kind: "local", base: "BASE", head: "c3", host: null, phab: null }, narrate: true }]);
});

test("trailers without readable history adopt one local round", () => {
  const rounds = adoptRounds(roundPlan({ revisions: [], diffs: [], historyError: "No arcrc token" }), { planId: "p", branch: "topic", head: "c2" });
  assert.deepEqual(rounds, [{ round: { kind: "local", base: "BASE", head: "c2", host: null, phab: null }, narrate: true }]);
});
