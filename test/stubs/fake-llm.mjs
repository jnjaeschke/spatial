#!/usr/bin/env node
// Stub for claude/codex. Logs argv+stdin to $FAKE_LLM_LOG (JSONL), prints $FAKE_LLM_STDOUT
// file contents, sleeps $FAKE_LLM_SLEEP_MS, exits with $FAKE_LLM_EXIT.
import { readFileSync, appendFileSync } from "node:fs";

const stdin = readFileSync(0, "utf8");
const env = process.env;
if (env.FAKE_LLM_LOG) appendFileSync(env.FAKE_LLM_LOG, JSON.stringify({ argv: process.argv.slice(2), stdin, cwd: process.cwd() }) + "\n");
setTimeout(() => {
  if (env.FAKE_LLM_STDOUT) process.stdout.write(readFileSync(env.FAKE_LLM_STDOUT, "utf8"));
  if (env.FAKE_LLM_STDERR) process.stderr.write(env.FAKE_LLM_STDERR);
  process.exitCode = Number(env.FAKE_LLM_EXIT ?? 0);
}, Number(env.FAKE_LLM_SLEEP_MS ?? 0));
