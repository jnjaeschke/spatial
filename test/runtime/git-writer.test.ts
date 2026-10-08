// REQUIRES_REAL_GIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeGitWriter } from "../../src/runtime/git.ts";
import { makeRepo } from "../helpers/git-fixture.ts";

const run = (dir: string, ...args: string[]) => execFileSync("git", ["-C", dir, "-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" }).trim();

test("defaultBase without origin is the local main", async () => {
  const repo = makeRepo();
  const sha = repo.commit({ "a.txt": "1\n" }, "base");
  assert.deepEqual(await makeGitWriter(repo.dir).defaultBase(), { ref: "main", sha });
});

test("defaultBase falls back to master and rejects when there is none", async () => {
  const repo = makeRepo();
  repo.commit({ "a.txt": "1\n" }, "base");
  repo.git("branch", "-m", "main", "master");
  assert.equal((await makeGitWriter(repo.dir).defaultBase()).ref, "master");
  repo.git("branch", "-m", "master", "trunk");
  await assert.rejects(makeGitWriter(repo.dir).defaultBase(), /no local main or master/);
});

test("defaultBase fetches origin and follows its HEAD when origin/HEAD is unset", async () => {
  const upstream = makeRepo();
  upstream.commit({ "a.txt": "1\n" }, "base");
  const bare = mkdtempSync(join(tmpdir(), "bare-"));
  run(upstream.dir, "clone", "--bare", "-q", upstream.dir, bare);
  const clone = mkdtempSync(join(tmpdir(), "clone-"));
  run(clone, "clone", "-q", bare, clone);
  run(clone, "remote", "set-head", "origin", "--delete");
  const next = upstream.commit({ "a.txt": "2\n" }, "second");
  run(upstream.dir, "push", "-q", bare, "main");
  assert.deepEqual(await makeGitWriter(clone).defaultBase(), { ref: "origin/main", sha: next });
});

test("defaultBase uses origin/HEAD when it is set", async () => {
  const upstream = makeRepo();
  upstream.commit({ "a.txt": "1\n" }, "base");
  const bare = mkdtempSync(join(tmpdir(), "bare-"));
  run(upstream.dir, "clone", "--bare", "-q", upstream.dir, bare);
  const clone = mkdtempSync(join(tmpdir(), "clone-"));
  run(clone, "clone", "-q", bare, clone);
  const sha = run(clone, "rev-parse", "origin/main");
  assert.deepEqual(await makeGitWriter(clone).defaultBase(), { ref: "origin/main", sha });
});

test("createBranch switches and keeps uncommitted changes; branchExists and currentBranch report it", async () => {
  const repo = makeRepo();
  const sha = repo.commit({ "a.txt": "1\n" }, "base");
  const writer = makeGitWriter(repo.dir);
  writeFileSync(join(repo.dir, "a.txt"), "changed\n");
  writeFileSync(join(repo.dir, "new.txt"), "n\n");
  assert.equal(await writer.changedFiles(), 2);
  assert.equal(await writer.branchExists("spatial/x"), false);
  await writer.createBranch("spatial/x", sha);
  assert.equal(await writer.branchExists("spatial/x"), true);
  assert.equal(await writer.currentBranch(), "spatial/x");
  assert.equal(await writer.changedFiles(), 2);
  repo.git("add", "-A");
  repo.git("commit", "-q", "-m", "work");
  repo.git("checkout", "-q", "--detach");
  assert.equal(await writer.currentBranch(), null);
});

test("createBranch rejects names that could be options", async () => {
  const repo = makeRepo();
  const sha = repo.commit({ "a.txt": "1\n" }, "base");
  await assert.rejects(makeGitWriter(repo.dir).createBranch("-x", sha), /Invalid branch name/);
});

test("fetch reports git's failure", async () => {
  const repo = makeRepo();
  repo.commit({ "a.txt": "1\n" }, "base");
  await assert.rejects(makeGitWriter(repo.dir).fetch("origin"), /git fetch origin failed/);
});

function configured() {
  const repo = makeRepo();
  repo.git("config", "user.name", "T");
  repo.git("config", "user.email", "t@t");
  repo.git("config", "commit.gpgsign", "false");
  return repo;
}

test("changedPaths lists staged, unstaged and untracked paths, renames by their new path", async () => {
  const repo = configured();
  repo.commit({ "a.txt": "1\n", "b.txt": "2\n" }, "base");
  writeFileSync(join(repo.dir, "a.txt"), "changed\n");
  writeFileSync(join(repo.dir, "new.txt"), "n\n");
  repo.git("mv", "b.txt", "c.txt");
  assert.deepEqual((await makeGitWriter(repo.dir).changedPaths()).sort(), ["a.txt", "c.txt", "new.txt"]);
});

test("commitAll commits every change and returns the sha", async () => {
  const repo = configured();
  repo.commit({ "a.txt": "1\n" }, "base");
  writeFileSync(join(repo.dir, "b.txt"), "b\n");
  const sha = await makeGitWriter(repo.dir).commitAll("Add b\n\nbody");
  assert.equal(sha, repo.git("rev-parse", "HEAD"));
  assert.equal(repo.git("log", "-1", "--format=%s"), "Add b");
  assert.equal(repo.git("status", "--porcelain"), "");
});

test("fixup squashes the change into the target commit and keeps the stack length", async () => {
  const repo = configured();
  const base = repo.commit({ "a.txt": "1\n" }, "base");
  const first = repo.commit({ "b.txt": "b\n" }, "First");
  repo.commit({ "c.txt": "c\n" }, "Second");
  writeFileSync(join(repo.dir, "b.txt"), "b2\n");
  const tip = await makeGitWriter(repo.dir).fixup(first, base);
  assert.equal(tip, repo.git("rev-parse", "HEAD"));
  assert.deepEqual(repo.git("log", "--format=%s", `${base}..HEAD`).split("\n"), ["Second", "First"]);
  assert.equal(repo.git("show", "HEAD~1:b.txt"), "b2");
});
