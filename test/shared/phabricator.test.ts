import assert from "node:assert/strict";
import { test } from "node:test";
import { commitRevision, parsePhabRevisionUrl, parseRevisionRef, phabRevision } from "../../src/shared/phabricator.ts";
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

test("parseRevisionRef accepts ids and URLs but rejects invalid revisions", () => {
  assert.deepEqual(parseRevisionRef("D5"), { host: null, id: 5 });
  assert.deepEqual(parseRevisionRef(" https://phab.example.com/D5/ "), { host: "https://phab.example.com", id: 5 });
  assert.deepEqual(parseRevisionRef("http://h:8080/D7"), { host: "http://h:8080", id: 7 });
  for (const text of ["D0", "D12x", "d5", "5", "https://phab.example.com/D5/extra", "ftp://h/D5", ""]) {
    assert.equal(parseRevisionRef(text), null, text);
  }
});
