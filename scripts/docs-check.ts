import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const tmp = mkdtempSync(join(tmpdir(), "docs-check-"));
try {
  execFileSync("npx", ["typedoc", "--out", tmp, "--logLevel", "Warn"], { stdio: "inherit" });
  const committed = "docs";
  const a = new Map(walk(committed).map((f) => [relative(committed, f), readFileSync(f, "utf8")]));
  const b = new Map(walk(tmp).map((f) => [relative(tmp, f), readFileSync(f, "utf8")]));
  const stale = [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).sort();
  if (stale.length) {
    console.error(`Generated docs are stale (run \`npm run docs\`):\n${stale.map((s) => `  ${s}`).join("\n")}`);
    process.exit(1);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
