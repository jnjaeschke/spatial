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
