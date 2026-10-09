// Runs a command with a TMPDIR of its own and removes it afterwards: tests create temp repos and databases through
// os.tmpdir() without cleaning up, and thousands of leftover git repos exhaust the inodes of a tmpfs /tmp.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("usage: with-tmpdir.ts <command> [args...]");
const dir = mkdtempSync(join(tmpdir(), "spatial-test-"));
try {
  const run = spawnSync(command, args, { stdio: "inherit", env: { ...process.env, TMPDIR: dir } });
  if (run.error) throw run.error;
  process.exitCode = run.status ?? 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
