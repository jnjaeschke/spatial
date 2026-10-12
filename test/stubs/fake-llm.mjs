#!/usr/bin/env node
// Stub for claude/codex. Logs argv+stdin to $FAKE_LLM_LOG (JSONL), routes by $FAKE_LLM_ROUTES or prints $FAKE_LLM_STDOUT
// file contents, sleeps $FAKE_LLM_SLEEP_MS, exits with $FAKE_LLM_EXIT. Fails with exit 1 when stdin
// contains $FAKE_LLM_FAIL_ON. A needle matches when every `&&`-separated part occurs in argv + stdin; a part
// starting with `!` must not occur.
// $FAKE_LLM_ACTIONS maps needles to shell scripts run in the working directory before the output
// (a fake write backend: edit files, commit).
// $FAKE_LLM_HANG_ON maps needles to files: on a match the file is printed and the stub then waits until killed
// (a write run that is stopped), without running any action.
import { readFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const stdin = readFileSync(0, "utf8");
const env = process.env;
const request = process.argv.slice(2).join(" ") + stdin;
const matches = (needle, text) => needle.split("&&").every((part) => part.startsWith("!") ? !text.includes(part.slice(1)) : text.includes(part));
if (env.FAKE_LLM_LOG) appendFileSync(env.FAKE_LLM_LOG, JSON.stringify({ argv: process.argv.slice(2), stdin, cwd: process.cwd() }) + "\n");
if (env.FAKE_LLM_FAIL_ON && stdin.includes(env.FAKE_LLM_FAIL_ON)) {
  process.stderr.write("stub failure");
  process.exit(1);
}
const hang = env.FAKE_LLM_HANG_ON && Object.entries(JSON.parse(env.FAKE_LLM_HANG_ON)).find(([needle]) => matches(needle, request));
if (hang) {
  process.stdout.write(readFileSync(hang[1], "utf8"));
  setInterval(() => {}, 1 << 30);
} else {
  if (env.FAKE_LLM_ACTIONS) {
    for (const [needle, script] of Object.entries(JSON.parse(env.FAKE_LLM_ACTIONS))) {
      if (matches(needle, request)) { execFileSync("sh", [script], { cwd: process.cwd(), stdio: ["ignore", "ignore", "inherit"] }); break; }
    }
  }
  setTimeout(() => {
    let output = env.FAKE_LLM_STDOUT;
    if (env.FAKE_LLM_ROUTES) {
      const routes = JSON.parse(env.FAKE_LLM_ROUTES);
      for (const [needle, file] of Object.entries(routes)) {
        if (matches(needle, request)) { output = file; break; }
      }
    }
    if (output) process.stdout.write(readFileSync(output, "utf8"));
    if (env.FAKE_LLM_STDERR) process.stderr.write(env.FAKE_LLM_STDERR);
    process.exitCode = Number(env.FAKE_LLM_EXIT ?? 0);
  }, Number(env.FAKE_LLM_SLEEP_MS ?? 0));
}
