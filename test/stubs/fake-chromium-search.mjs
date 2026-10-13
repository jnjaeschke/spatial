#!/usr/bin/env node
// Stub for chromium-search. `search` finds nothing; `find` lists frame_loader.cc only; `cat <path> -n` prints the captured
// frame_loader.cc for that path (or fails like an unreachable server when $FAKE_CHROMIUM_UNREACHABLE is set) and fails as
// chromium-search does for any other path.
import { readFileSync } from "node:fs";

const FRAME_LOADER = "third_party/blink/renderer/core/loader/frame_loader.cc";
const [command, arg] = process.argv.slice(2);
// Returns the exit code instead of calling process.exit, which drops unflushed output on macOS, where pipes are asynchronous.
function main() {
  if (command === "search") {
    process.stderr.write("No results found\n");
    process.stdout.write("[]\n");
    return 0;
  }
  if (command === "find") {
    if (arg === FRAME_LOADER) process.stdout.write(`${FRAME_LOADER}\n`);
    else process.stderr.write("No results found\n");
    return 0;
  }
  if (command === "cat" && arg === FRAME_LOADER && !process.env.FAKE_CHROMIUM_UNREACHABLE) {
    process.stdout.write(readFileSync(new URL("../fixtures/chromium/frame_loader.cc.txt", import.meta.url), "utf8"));
    return 0;
  }
  process.stderr.write(`Error: File not found: ${arg} at refs/heads/main\n`);
  return 1;
}
process.exitCode = main();
