import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRuntime } from "../../src/runtime/create.ts";
import { createSession } from "../../src/runtime/git.ts";
import { narratePatch } from "../../src/workflows/narrate-patch.ts";
import type { PatchNarrativeData } from "../../src/shared/types.ts";
import { makeRepo } from "../helpers/git-fixture.ts";

const STUB = fileURLToPath(new URL("../stubs/fake-llm.mjs", import.meta.url));
const CLI = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "np-"));
  const r = makeRepo();
  r.commit({ "a.txt": "1\n2\n3\n" }, "base");
  r.commit({ "a.txt": "1\nTWO\n3\n", "c.txt": "c\n" }, "Bug 1 - Change things");
  const narrative = {
    summary: "Changes things.",
    changes: [
      { id: "c1", title: "Edit a", explanation: "e", rationale: "r", hunkIds: ["f0h0"], dependsOn: [], specUrls: [] },
      { id: "c2", title: "Add c", explanation: "e", rationale: "r", hunkIds: ["f1h0"], dependsOn: ["c1"], specUrls: [] },
    ],
  };
  const out = join(dir, "claude-out.json");
  writeFileSync(out, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: narrative, session_id: "s", usage: { input_tokens: 5, output_tokens: 5 } }));
  const reviewOut = join(dir, "findings.json");
  writeFileSync(reviewOut, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { findings: [], verdicts: [] }, session_id: "s", usage: { input_tokens: 1, output_tokens: 1 } }));
  process.env.FAKE_LLM_ROUTES = JSON.stringify({ '"findings"': reviewOut });
  process.env.FAKE_LLM_STDOUT = out;
  process.env.FAKE_LLM_LOG = join(dir, "log.jsonl");
  return { dir, r, narrative };
}

test("narratePatch: importDiff, narrate, resolve spec refs and review, persisted with events", async () => {
  const { dir, r, narrative } = fixture();
  const rt = createRuntime({ dbPath: join(dir, "db.sqlite"), claudeBin: STUB });
  const session = await createSession(rt.store, r.dir, "t");
  const { diffId, narrativeId } = await narratePatch(rt, session.id, { base: "HEAD~1", head: "HEAD" });
  const n = rt.store.getArtifact<PatchNarrativeData>(narrativeId);
  assert.deepEqual(n.data, { diffId, ...narrative });
  assert.deepEqual(n.provenance.llm, { backend: "claude", model: "sonnet", effort: "medium" });
  const types = rt.store.listEvents(session.id).map((e) => e.type);
  assert.equal(types.filter((t) => t === "task.succeeded").length, 4);
  assert.equal(rt.store.listTasks(session.id).at(-1)?.kind, "review");
  assert.ok(types.includes("llm.usage"));
  const call = JSON.parse(readFileSync(process.env.FAKE_LLM_LOG!, "utf8").trim().split("\n")[0]);
  assert.equal(call.cwd, session.repo);
});

test("narratePatch can narrate an existing Diff without importing another", async () => {
  const { dir, r } = fixture();
  const rt = createRuntime({ dbPath: join(dir, "reuse.sqlite"), claudeBin: STUB });
  const session = await createSession(rt.store, r.dir, "t");
  const { diffId } = await rt.run<{ diffId: string }>(session.id, "importDiff", { base: "HEAD~1", head: "HEAD" });
  const before = rt.store.listArtifacts(session.id, "Diff").length;
  const result = await narratePatch(rt, session.id, { diffId });
  assert.equal(result.diffId, diffId);
  assert.equal(rt.store.listArtifacts(session.id, "Diff").length, before);
});

test("CLI narrate prints the narrative JSON", () => {
  const { dir, r, narrative } = fixture();
  const stdout = execFileSync(process.execPath, [CLI, "narrate", r.dir, "HEAD~1..HEAD", "--db", join(dir, "cli.sqlite")], {
    encoding: "utf8",
    env: { ...process.env, SPATIAL_CLAUDE_BIN: STUB },
  });
  const out = JSON.parse(stdout);
  assert.deepEqual(out.narrative.changes.map((c: { id: string }) => c.id), ["c1", "c2"]);
  assert.equal(out.narrative.summary, narrative.summary);
  assert.equal(typeof out.sessionId, "string");
});

test("CLI reports bad usage and task failures on stderr with exit 1", () => {
  const { dir, r } = fixture();
  const run = (args: string[]) => {
    try {
      execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8", stdio: "pipe", env: { ...process.env, SPATIAL_CLAUDE_BIN: STUB } });
      return { code: 0, stderr: "" };
    } catch (e) {
      const err = e as { status: number; stderr: string };
      return { code: err.status, stderr: err.stderr };
    }
  };
  const bad = run(["narrate", r.dir, "HEAD"]);
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /Range must be <base>\.\.<head>/);
  const fail = run(["narrate", r.dir, "HEAD..HEAD~1", "--db", join(dir, "x.sqlite")]);
  assert.equal(fail.code, 1);
  assert.match(fail.stderr, /is not an ancestor of/);
});
