import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { scmRoutes } from "../../../src/plugins/scm/server/routes.ts";
import { routeCall } from "../../helpers/route-call.ts";
import { makeRepo } from "../../helpers/git-fixture.ts";

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

// REQUIRES_REAL_GIT
test("scm routes answer for the repository containing the repo path", async () => {
  const r = makeRepo();
  const first = r.commit({ "a.txt": "one\n" }, "first");
  const second = r.commit({ "a.txt": "two\n" }, "second");
  const routes = scmRoutes();

  const refs = await routeCall(routes, "GET", `/api/scm/refs?${q({ repo: r.dir })}`);
  assert.equal(refs.status, 200);
  assert.equal(refs.body.commitGraph, false);
  assert.ok(refs.body.refs.some((row: { name: string; sha: string }) => row.name === "main" && row.sha === second));

  const log = await routeCall(routes, "GET", `/api/scm/log?${q({ repo: r.dir, scope: "all", skip: "1", limit: "5" })}`);
  assert.deepEqual(log.body.map((row: { sha: string }) => row.sha), [first]);
  const range = await routeCall(routes, "GET", `/api/scm/log?${q({ repo: r.dir, scope: "range", range: `${first}..${second}` })}`);
  assert.deepEqual(range.body.map((row: { sha: string }) => row.sha), [second]);

  const commit = await routeCall(routes, "GET", `/api/scm/commit?${q({ repo: r.dir, rev: second })}`);
  assert.equal(commit.body.subject, "second");
  assert.deepEqual(commit.body.files.map((file: { path: string }) => file.path), ["a.txt"]);

  const diff = await routeCall(routes, "GET", `/api/scm/diff?${q({ repo: r.dir, a: first, b: second, path: "a.txt" })}`);
  assert.equal(diff.body[0].path, "a.txt");
  const rootDiff = await routeCall(routes, "GET", `/api/scm/diff?${q({ repo: r.dir, b: first })}`);
  assert.equal(rootDiff.body[0].status, "added");

  const files = await routeCall(routes, "GET", `/api/scm/files?${q({ repo: r.dir, a: first, b: second })}`);
  assert.deepEqual(files.body.map((file: { path: string }) => file.path), ["a.txt"]);
  const rootFiles = await routeCall(routes, "GET", `/api/scm/files?${q({ repo: r.dir, b: first })}`);
  assert.equal(rootFiles.body[0].status, "added");
  const current = await routeCall(routes, "GET", `/api/scm/log?${q({ repo: r.dir, scope: "current" })}`);
  assert.equal(current.status, 200);
  const twoPaths = await routeCall(routes, "GET", `/api/scm/diff?repo=${encodeURIComponent(r.dir)}&a=${first}&b=${second}&path=a.txt&path=missing.txt`);
  assert.deepEqual(twoPaths.body.map((file: { path: string }) => file.path), ["a.txt"]);

  const file = await routeCall(routes, "GET", `/api/scm/file?${q({ repo: r.dir, rev: first, path: "a.txt" })}`);
  assert.deepEqual(file.body, { lines: ["one"] });
});

// REQUIRES_REAL_GIT
test("scm routes reject bad input with 400", async () => {
  const r = makeRepo();
  const sha = r.commit({ "a.txt": "one\n" }, "first");
  const routes = scmRoutes();
  const status = async (path: string) => (await routeCall(routes, "GET", path)).status;
  assert.equal(await status(`/api/scm/refs`), 400);
  assert.equal(await status(`/api/scm/refs?${q({ repo: "relative/path" })}`), 400);
  assert.equal(await status(`/api/scm/refs?${q({ repo: mkdtempSync(`${tmpdir()}/not-a-repo-`) })}`), 400);
  assert.equal(await status(`/api/scm/log?${q({ repo: r.dir, scope: "nope" })}`), 400);
  assert.equal(await status(`/api/scm/log?${q({ repo: r.dir, scope: "range" })}`), 400);
  assert.equal(await status(`/api/scm/log?${q({ repo: r.dir, scope: "all", limit: "x" })}`), 400);
  assert.equal(await status(`/api/scm/commit?${q({ repo: r.dir, rev: "--all" })}`), 400);
  assert.equal(await status(`/api/scm/commit?${q({ repo: r.dir, rev: "missing" })}`), 400);
  assert.equal(await status(`/api/scm/files?${q({ repo: r.dir, a: "--all", b: sha })}`), 400);
  assert.equal(await status(`/api/scm/diff?${q({ repo: r.dir, b: sha, path: "../x" })}`), 400);
  assert.equal(await status(`/api/scm/file?${q({ repo: r.dir, rev: sha, path: "/etc/passwd" })}`), 400);
});
