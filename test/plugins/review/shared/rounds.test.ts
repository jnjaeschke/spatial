import { test } from "node:test";
import assert from "node:assert/strict";
import { groupRounds, roundLabel, roundStack, type RoundDiff } from "../../../../src/plugins/review/shared/rounds.ts";

const d = (revision: number, diffId: number, dateCreated: number, base = "b"): RoundDiff => ({ revision, diffId, base, dateCreated });

test("diffs of a stack submitted together form one round", () => {
  const rounds = groupRounds([d(2, 11, 1000), d(1, 10, 990), d(1, 20, 5000), d(2, 21, 5030)]);
  assert.deepEqual(rounds.map((r) => r.map((x) => x.diffId)), [[10, 11], [20, 21]]);
});

test("a round holds one diff per revision and ends after the window", () => {
  const rounds = groupRounds([d(1, 10, 0), d(1, 11, 60), d(2, 12, 120), d(2, 13, 120 + 601)]);
  assert.deepEqual(rounds.map((r) => r.map((x) => x.diffId)), [[10], [11, 12], [13]]);
});

test("roundStack carries a revision's newest earlier diff into rounds that did not update it", () => {
  const rounds = groupRounds([d(1, 10, 0), d(2, 11, 5), d(2, 21, 5000)]);
  assert.deepEqual(roundStack(rounds, 1, [1, 2]).map((x) => x.diffId), [10, 21]);
  assert.deepEqual(roundStack(rounds, 0, [2, 1]).map((x) => x.diffId), [11, 10]);
});

test("roundStack leaves out revisions without a diff yet", () => {
  const rounds = groupRounds([d(1, 10, 0), d(2, 21, 5000)]);
  assert.deepEqual(roundStack(rounds, 0, [1, 2]).map((x) => x.diffId), [10]);
});

test("a round's chip names its Phabricator diffs, or the adopted head when it has none", () => {
  const e = (revision: number, diffId: number) => ({ ...d(revision, diffId, 0), title: "t", latestDiffId: diffId });
  assert.equal(roundLabel({ kind: "phabricator", host: "H", stack: [e(1, 10), e(2, 11)] }), "Round · D1 #10, D2 #11");
  assert.equal(roundLabel({ kind: "local", base: "b", head: "h", host: "H", phab: [e(1, 20), e(2, 21)] }), "Round · D1 #20, D2 #21 (local)");
  assert.equal(roundLabel({ kind: "local", base: "b", head: "0123456789abcdef", host: null, phab: null }), "Adopted up to 0123456789ab");
});
