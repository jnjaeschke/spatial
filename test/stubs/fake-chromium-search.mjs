#!/usr/bin/env node
// Stub for chromium-search. `search` finds nothing; `cat <path> -n` prints the captured frame_loader.cc for that path and fails as
// chromium-search does for any other path.
import { readFileSync } from "node:fs";

const FRAME_LOADER = "third_party/blink/renderer/core/loader/frame_loader.cc";
const [command, arg] = process.argv.slice(2);
if (command === "search") {
  process.stderr.write("No results found\n");
  process.stdout.write("[]\n");
  process.exit(0);
}
if (command === "cat" && arg === FRAME_LOADER) {
  process.stdout.write(readFileSync(new URL("../fixtures/chromium/frame_loader.cc.txt", import.meta.url), "utf8"));
  process.exit(0);
}
process.stderr.write(`Error: File not found: ${arg} at refs/heads/main\n`);
process.exit(1);
