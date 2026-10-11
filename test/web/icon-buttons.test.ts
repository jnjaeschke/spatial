import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

test("buttons with aria-label use IconButton", () => {
  const violations = tsxFiles("src").filter((file) => !file.endsWith("/IconButton.tsx")).flatMap((file) => readFileSync(file, "utf8").split("\n").flatMap((line, index) => /<button[^>]*aria-label=/.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : []));
  assert.deepEqual(violations, [], violations.join("\n"));
});
