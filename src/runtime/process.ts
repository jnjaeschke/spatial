import { spawn } from "node:child_process";

/** Spawns `cmd`, writes `stdin`, collects output. Abort kills the child (SIGTERM) and rejects. */
export function runProcess(
  cmd: string,
  args: string[],
  opts: { stdin: string; cwd?: string; signal: AbortSignal; onStdoutLine?: (line: string) => void },
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    if (opts.signal.aborted) return reject(new Error("aborted"));
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let pending = "";
    const line = (text: string) => { try { opts.onStdoutLine!(text); } catch (e) { console.error(`stdout line handler failed: ${(e as Error).message}`); } };
    child.stdout.setEncoding("utf8").on("data", (d: string) => {
      stdout += d;
      if (!opts.onStdoutLine) return;
      pending += d;
      const lines = pending.split("\n");
      pending = lines.pop()!;
      for (const text of lines) line(text);
    });
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    const onAbort = () => child.kill("SIGTERM");
    opts.signal.addEventListener("abort", onAbort, { once: true });
    child.on("error", (e) => {
      opts.signal.removeEventListener("abort", onAbort);
      reject(new Error(`Cannot run ${cmd}: ${e.message}`));
    });
    child.on("close", (code) => {
      opts.signal.removeEventListener("abort", onAbort);
      if (pending && opts.onStdoutLine) line(pending);
      if (opts.signal.aborted) reject(new Error("aborted"));
      else resolve({ stdout, stderr, code: code ?? -1 });
    });
    child.stdin.on("error", () => {}); // child may exit before reading stdin; close/error handlers report it
    child.stdin.end(opts.stdin);
  });
}
