import { spawn } from "node:child_process";

/** Spawns `cmd`, writes `stdin`, collects output. Abort kills the child (SIGTERM) and rejects. */
export function runProcess(
  cmd: string,
  args: string[],
  opts: { stdin: string; cwd?: string; signal: AbortSignal },
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    if (opts.signal.aborted) return reject(new Error("aborted"));
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    const onAbort = () => child.kill("SIGTERM");
    opts.signal.addEventListener("abort", onAbort, { once: true });
    child.on("error", (e) => {
      opts.signal.removeEventListener("abort", onAbort);
      reject(new Error(`Cannot run ${cmd}: ${e.message}`));
    });
    child.on("close", (code) => {
      opts.signal.removeEventListener("abort", onAbort);
      if (opts.signal.aborted) reject(new Error("aborted"));
      else resolve({ stdout, stderr, code: code ?? -1 });
    });
    child.stdin.on("error", () => {}); // child may exit before reading stdin; close/error handlers report it
    child.stdin.end(opts.stdin);
  });
}
