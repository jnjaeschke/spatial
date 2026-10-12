#!/usr/bin/env node
// Stub for claude/codex. Logs argv+stdin to $FAKE_LLM_LOG (JSONL), routes by $FAKE_LLM_ROUTES or prints $FAKE_LLM_STDOUT
// file contents, sleeps $FAKE_LLM_SLEEP_MS, exits with $FAKE_LLM_EXIT. Fails with exit 1 when stdin
// contains $FAKE_LLM_FAIL_ON. A needle matches when every `&&`-separated part occurs in argv + stdin; a part
// starting with `!` must not occur.
// $FAKE_LLM_ACTIONS maps needles to shell scripts run in the working directory before the output
// (a fake write backend: edit files, commit).
// $FAKE_LLM_HANG_ON maps needles to files: on a match the file is printed and the stub then waits until killed
// (a write run that is stopped), without running any action.
// $FAKE_LLM_DELAYS maps needles to milliseconds the stub waits before its output, instead of $FAKE_LLM_SLEEP_MS.
// With `--input-format stream-json` (claude live input), stdin is the text of the first user message; every
// message is echoed as a replay when read, later ones are logged as `{ live: text }`, and the stub exits when
// stdin ends.
import { readFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";

const env = process.env;
const streamInput = process.argv.includes("--input-format");
const messageText = (line) => JSON.parse(line).message.content.map((part) => part.text).join("");
const replay = (text) => process.stdout.write(JSON.stringify({ type: "user", isReplay: true, message: { role: "user", content: [{ type: "text", text }] } }) + "\n");
const lines = streamInput ? createInterface({ input: process.stdin })[Symbol.asyncIterator]() : null;
const stdin = streamInput ? messageText((await lines.next()).value) : readFileSync(0, "utf8");
if (streamInput) replay(stdin);
const request = process.argv.slice(2).join(" ") + stdin;
const matches = (needle, text) => needle.split("&&").every((part) => part.startsWith("!") ? !text.includes(part.slice(1)) : text.includes(part));
if (env.FAKE_LLM_LOG) appendFileSync(env.FAKE_LLM_LOG, JSON.stringify({ argv: process.argv.slice(2), stdin, cwd: process.cwd() }) + "\n");
if (streamInput) void (async () => {
  for (let next = await lines.next(); !next.done; next = await lines.next()) {
    const text = messageText(next.value);
    if (env.FAKE_LLM_LOG) appendFileSync(env.FAKE_LLM_LOG, JSON.stringify({ live: text }) + "\n");
    replay(text);
  }
})();
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
    // Live input ends at the result line, which must be complete to be read.
    if (output) process.stdout.write(streamInput ? readFileSync(output, "utf8").replace(/\n?$/, "\n") : readFileSync(output, "utf8"));
    if (env.FAKE_LLM_STDERR) process.stderr.write(env.FAKE_LLM_STDERR);
    process.exitCode = Number(env.FAKE_LLM_EXIT ?? 0);
  }, Number((env.FAKE_LLM_DELAYS && Object.entries(JSON.parse(env.FAKE_LLM_DELAYS)).find(([needle]) => matches(needle, request))?.[1]) ?? env.FAKE_LLM_SLEEP_MS ?? 0));
}
