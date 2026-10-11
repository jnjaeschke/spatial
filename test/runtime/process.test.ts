import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runChecked } from "../../src/runtime/process.ts";
import { commandRunData } from "../../src/runtime/command-run.ts";

const STUB = fileURLToPath(new URL("../stubs/fake-llm.mjs", import.meta.url));
const signal = new AbortController().signal;
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "proc-"));
  for (const key of ["FAKE_LLM_STDOUT", "FAKE_LLM_STDERR", "FAKE_LLM_EXIT", "FAKE_LLM_LOG"]) delete process.env[key];
});

test("runChecked returns the output of a successful run", async () => {
  writeFileSync(join(dir, "out"), "hello");
  process.env.FAKE_LLM_STDOUT = join(dir, "out");
  assert.deepEqual(await runChecked(STUB, [], { stdin: "", signal, label: "stub" }), { stdout: "hello", stderr: "" });
});

test("runChecked throws with the label, the code and the tail of stderr, or of stdout without stderr", async () => {
  process.env.FAKE_LLM_EXIT = "3";
  process.env.FAKE_LLM_STDERR = "x".repeat(50) + "the end";
  await assert.rejects(runChecked(STUB, [], { stdin: "", signal, label: "stub", tail: 7 }), { message: "stub exited with code 3: the end" });
  delete process.env.FAKE_LLM_STDERR;
  writeFileSync(join(dir, "out"), "only stdout");
  process.env.FAKE_LLM_STDOUT = join(dir, "out");
  await assert.rejects(runChecked(STUB, [], { stdin: "", signal, label: "stub" }), { message: "stub exited with code 3: only stdout" });
});

test("commandRunData caps the output at 256 KB", () => {
  const data = commandRunData("make", 1, 5, "a".repeat(262145), true);
  assert.equal(data.output, `${"a".repeat(262144)}\n[output truncated]`);
  assert.deepEqual({ ...data, output: "" }, { command: "make", exitCode: 1, durationMs: 5, output: "", test: true });
});
