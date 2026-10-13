import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { makeRepo } from "../helpers/git-fixture.ts";
import { Store } from "../../src/runtime/store.ts";
import type { Artifact, WorkflowStartData } from "../../src/shared/types.ts";

const CLI = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
const STUB = fileURLToPath(new URL("../stubs/fake-llm.mjs", import.meta.url));

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "cli-run-"));
  const repo = makeRepo();
  repo.commit({ "a.txt": "before\n" }, "base");
  repo.commit({ "a.txt": "after\n" }, "change");
  const narrative = { summary: "Changes things.", changes: [{ id: "c1", title: "Edit a", explanation: "e", rationale: "r", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] }] };
  const out = join(dir, "claude-out.json");
  writeFileSync(out, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: narrative, session_id: "s", usage: { input_tokens: 1, output_tokens: 1 } }));
  const findings = join(dir, "findings.json");
  writeFileSync(findings, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { findings: [], verdicts: [] }, session_id: "s", usage: { input_tokens: 1, output_tokens: 1 } }));
  return { dir, repo, env: { ...process.env, SPATIAL_CLAUDE_BIN: STUB, FAKE_LLM_STDOUT: out, FAKE_LLM_ROUTES: JSON.stringify({ '"findings"': findings }) } };
}

test("spatial run reports an unknown workflow command", () => {
  const dir = mkdtempSync(join(tmpdir(), "cli-run-"));
  assert.throws(() => execFileSync(process.execPath, [CLI, "run", ".", "/missing", "--db", join(dir, "unknown.sqlite")], { encoding: "utf8", env: process.env }), (error: unknown) => {
    const result = error as { status: number; stderr: string };
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown command/);
    return true;
  });
});

test("spatial run starts the named workflow and prints its session overview", () => {
  const { dir, repo, env } = fixture();
  const stdout = execFileSync(process.execPath, [CLI, "run", repo.dir, "/review", "HEAD~1..HEAD", "--db", join(dir, "run.sqlite")], { encoding: "utf8", env });
  assert.match(stdout, /^# Request\nHEAD~1\.\.HEAD/m);
  assert.match(stdout, /Changes things\./);
  assert.doesNotMatch(stdout, /"narrative"\s*:/);
});

test("spatial run stores the chosen model on the user's workflow start", () => {
  const { dir, repo, env } = fixture();
  const db = join(dir, "model.sqlite");
  execFileSync(process.execPath, [CLI, "run", repo.dir, "/review", "HEAD~1..HEAD", "--model", "opus", "--db", db], { encoding: "utf8", env });
  const store = new Store(db);
  const [session] = store.listSessions();
  const start = store.listArtifacts(session!.id, "WorkflowStart")[0] as Artifact<WorkflowStartData>;
  assert.equal(start.data.llm?.model, "opus");
  assert.deepEqual(start.provenance, { taskId: "user" });
});

test("spatial run with a command that has no arguments reviews the latest commit", () => {
  const { dir, repo, env } = fixture();
  const stdout = execFileSync(process.execPath, [CLI, "run", repo.dir, "/review", "--db", join(dir, "latest.sqlite")], { encoding: "utf8", env });
  assert.match(stdout, /^# Request\n\n/m);
  assert.match(stdout, /Changes things\./);
});

test("spatial run preserves command validation and workflow error output", () => {
  const { dir, repo, env } = fixture();
  const run = (command: string, database: string) => {
    try {
      execFileSync(process.execPath, [CLI, "run", repo.dir, command, "--db", join(dir, database)], { encoding: "utf8", env });
      return { status: 0, stderr: "" };
    } catch (error) {
      const result = error as { status: number; stderr: string };
      return { status: result.status, stderr: result.stderr };
    }
  };
  assert.equal(run("/review HEAD", "bad-usage.sqlite").status, 1);
  assert.match(run("/review HEAD", "bad-usage-2.sqlite").stderr, /Usage: \/review/);
  const revision = run("/review D123", "revision.sqlite");
  assert.equal(revision.status, 1);
  assert.ok(revision.stderr.trim());
  const failedRange = run("/review HEAD..HEAD~1", "failed-range.sqlite");
  assert.equal(failedRange.status, 1);
  assert.match(failedRange.stderr, /is not an ancestor of/);
});
