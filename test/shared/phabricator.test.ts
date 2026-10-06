import assert from "node:assert/strict";
import { test } from "node:test";
import { phabRevision } from "../../src/shared/phabricator.ts";
import type { DiffData } from "../../src/shared/types.ts";

function diff(bodies: string[]): DiffData {
  return {
    baseSha: "base",
    headSha: "head",
    commits: bodies.map((body, index) => ({ sha: `sha${index}`, subject: "subject", body })),
    files: [],
  };
}

test("phabRevision reads the trailer from the head commit body", () => {
  assert.deepEqual(phabRevision(diff(["earlier", "Change things\n\nDifferential Revision: https://phab.example.com/D123"])), {
    host: "https://phab.example.com",
    id: 123,
  });
});

test("phabRevision ignores a trailer in an earlier commit", () => {
  assert.equal(phabRevision(diff(["Differential Revision: https://phab.example.com/D123", "head"])), null);
});

test("phabRevision returns null when no trailer is present", () => {
  assert.equal(phabRevision(diff(["head without a trailer"])), null);
});
