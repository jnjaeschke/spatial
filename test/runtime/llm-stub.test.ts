import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "../../src/runtime/process.ts";

const STUB = fileURLToPath(new URL("../stubs/fake-llm.mjs", import.meta.url));

test("stub actions run in the working directory before the output; && needles need every part", async () => {
  const dir = mkdtempSync(join(tmpdir(), "stub-"));
  const script = join(dir, "act.sh");
  writeFileSync(script, "echo done > touched.txt\n");
  const out = join(dir, "out");
  writeFileSync(out, "OUT");
  const routed = join(dir, "routed");
  writeFileSync(routed, "ROUTED");
  Object.assign(process.env, { FAKE_LLM_ACTIONS: JSON.stringify({ "alpha&&beta": script }), FAKE_LLM_STDOUT: out, FAKE_LLM_ROUTES: JSON.stringify({ "gamma&&delta": routed }) });
  try {
    const signal = new AbortController().signal;
    const only = await runProcess(STUB, [], { stdin: "alpha gamma", cwd: dir, signal });
    assert.equal(only.stdout, "OUT");
    assert.equal(existsSync(join(dir, "touched.txt")), false);
    const both = await runProcess(STUB, [], { stdin: "alpha beta gamma delta", cwd: dir, signal });
    assert.equal(both.stdout, "ROUTED");
    assert.equal(readFileSync(join(dir, "touched.txt"), "utf8").trim(), "done");
  } finally {
    for (const name of ["FAKE_LLM_ACTIONS", "FAKE_LLM_STDOUT", "FAKE_LLM_ROUTES"]) delete process.env[name];
  }
});

test("a !-prefixed needle part must be absent; a hang route prints its file and then waits until killed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "stub-"));
  const out = join(dir, "out");
  writeFileSync(out, "OUT");
  const hanging = join(dir, "hanging");
  writeFileSync(hanging, "HANGING\n");
  Object.assign(process.env, { FAKE_LLM_HANG_ON: JSON.stringify({ "alpha&&!resume": hanging }), FAKE_LLM_STDOUT: out });
  try {
    const resumed = await runProcess(STUB, [], { stdin: "alpha resume", cwd: dir, signal: new AbortController().signal });
    assert.equal(resumed.stdout, "OUT");
    const controller = new AbortController();
    const lines: string[] = [];
    const hung = runProcess(STUB, [], { stdin: "alpha", cwd: dir, signal: controller.signal, onStdoutLine: (line) => lines.push(line) });
    setTimeout(() => controller.abort(), 500);
    await assert.rejects(hung, /aborted/);
    assert.deepEqual(lines, ["HANGING"]);
  } finally {
    for (const name of ["FAKE_LLM_HANG_ON", "FAKE_LLM_STDOUT"]) delete process.env[name];
  }
});
