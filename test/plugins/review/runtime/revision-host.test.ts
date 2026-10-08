import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ImportRevisionError } from "../../../../src/plugins/review/runtime/import-revision.ts";
import { resolveRevisionHost } from "../../../../src/plugins/review/runtime/revision-host.ts";

function withRepo(run: (repo: string) => void) {
  const repo = mkdtempSync(join(tmpdir(), "revision-host-"));
  try { run(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

test("explicit revision host wins without reading the repo config", () => {
  assert.equal(resolveRevisionHost("/definitely/not/a/repository", "https://host"), "https://host");
});

test("revision host reads and normalizes phabricator.uri", () => withRepo((repo) => {
  writeFileSync(join(repo, ".arcconfig"), JSON.stringify({ "phabricator.uri": "https://phabricator.services.mozilla.com/", project_id: "mozilla" }));
  assert.equal(resolveRevisionHost(repo, null), "https://phabricator.services.mozilla.com");
  writeFileSync(join(repo, ".arcconfig"), JSON.stringify({ "phabricator.uri": "https://host///" }));
  assert.equal(resolveRevisionHost(repo, null), "https://host");
}));

test("revision host reports invalid or missing repo configuration", () => withRepo((repo) => {
  const invalid = [
    null,
    "{invalid json",
    JSON.stringify({}),
    JSON.stringify({ "phabricator.uri": 4 }),
    JSON.stringify({ "phabricator.uri": "ftp://x/" }),
    JSON.stringify({ "phabricator.uri": "https://host/with/path" }),
    JSON.stringify({ "phabricator.uri": "" }),
  ];
  for (const config of invalid) {
    rmSync(join(repo, ".arcconfig"), { force: true });
    if (config !== null) writeFileSync(join(repo, ".arcconfig"), config);
    assert.throws(() => resolveRevisionHost(repo, null), (error: unknown) => {
      assert.ok(error instanceof ImportRevisionError);
      assert.equal(error.kind, "precondition");
      assert.match(error.message, /\.arcconfig/);
      assert.match(error.message, /https:\/\/host\/D123|phabricator\.uri/);
      return true;
    });
  }
}));
