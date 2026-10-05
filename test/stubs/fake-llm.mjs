#!/usr/bin/env node
// Stub for claude/codex. Logs argv+stdin to $FAKE_LLM_LOG (JSONL), routes by $FAKE_LLM_ROUTES or prints $FAKE_LLM_STDOUT
// file contents, sleeps $FAKE_LLM_SLEEP_MS, exits with $FAKE_LLM_EXIT. Fails with exit 1 when stdin
// contains $FAKE_LLM_FAIL_ON.
import { readFileSync, appendFileSync } from "node:fs";

const stdin = readFileSync(0, "utf8");
const env = process.env;
if (env.FAKE_LLM_LOG) appendFileSync(env.FAKE_LLM_LOG, JSON.stringify({ argv: process.argv.slice(2), stdin, cwd: process.cwd() }) + "\n");
if (env.FAKE_LLM_FAIL_ON && stdin.includes(env.FAKE_LLM_FAIL_ON)) {
  process.stderr.write("stub failure");
  process.exit(1);
}
setTimeout(() => {
  let output = env.FAKE_LLM_STDOUT;
  if (env.FAKE_LLM_ROUTES) {
    const routes = JSON.parse(env.FAKE_LLM_ROUTES);
    const request = process.argv.slice(2).join(" ") + stdin;
    for (const [needle, file] of Object.entries(routes)) {
      if (request.includes(needle)) { output = file; break; }
    }
  }
  if (output) process.stdout.write(readFileSync(output, "utf8"));
  if (env.FAKE_LLM_STDERR) process.stderr.write(env.FAKE_LLM_STDERR);
  process.exitCode = Number(env.FAKE_LLM_EXIT ?? 0);
}, Number(env.FAKE_LLM_SLEEP_MS ?? 0));
