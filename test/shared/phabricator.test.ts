import assert from "node:assert/strict";
import { test } from "node:test";
import { commitRevision, parsePhabRevisionUrl, phabRevision } from "../../src/shared/phabricator.ts";
import type { Commit, DiffData } from "../../src/shared/types.ts";

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

test("commitRevision reads a commit trailer independently", () => {
  const commit: Commit = { sha: "sha", subject: "subject", body: "change\n\nDifferential Revision: https://phab.example.com/D456" };
  assert.deepEqual(commitRevision(commit), { host: "https://phab.example.com", id: 456 });
  assert.equal(commitRevision({ ...commit, body: "no trailer" }), null);
});

test("parsePhabRevisionUrl accepts revision URLs and rejects other paths", () => {
  for (const text of ["https://phab.example.com/D123", "https://phab.example.com/D123/", "  https://phab.example.com/D123  "]) {
    assert.deepEqual(parsePhabRevisionUrl(text), { host: "https://phab.example.com", id: 123 });
  }
  for (const text of ["D123", "https://phab.example.com/D123/extra", "https://phab.example.com/D", "https://phab.example.com/differential/D1"]) {
    assert.equal(parsePhabRevisionUrl(text), null);
  }
});
