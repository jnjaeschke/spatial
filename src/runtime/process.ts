import { spawn } from "node:child_process";
import type { Writable } from "node:stream";

/** `text` cut to `max` characters, marked when cut. */
export const capOutput = (text: string, max: number) => text.length > max ? `${text.slice(0, max)}\n[output truncated]` : text;

/** Spawns `cmd`, writes `stdin`, collects output. A function `stdin` gets the open stream and ends it itself. `env` adds to the inherited environment. Abort kills the child (SIGTERM) and rejects. */
export function runProcess(
  cmd: string,
  args: string[],
  opts: { stdin: string | ((stdin: Writable) => void); cwd?: string; signal: AbortSignal; env?: Record<string, string>; onStdoutLine?: (line: string) => void },
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    if (opts.signal.aborted) return reject(new Error("aborted"));
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ? { ...process.env, ...opts.env } : undefined, stdio: ["pipe", "pipe", "pipe"] });
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
    if (typeof opts.stdin === "string") child.stdin.end(opts.stdin);
    else opts.stdin(child.stdin);
  });
}

/** `runProcess` that throws `${label} exited with code N: <tail>` on a non-zero exit; the tail is the last `tail` (default 1000) characters of stderr, or of stdout when stderr is empty. */
export async function runChecked(cmd: string, args: string[], opts: Parameters<typeof runProcess>[2] & { label: string; tail?: number }): Promise<{ stdout: string; stderr: string }> {
  const { label, tail = 1000, ...rest } = opts;
  const { stdout, stderr, code } = await runProcess(cmd, args, rest);
  if (code !== 0) throw new Error(`${label} exited with code ${code}: ${(stderr || stdout).trim().slice(-tail)}`);
  return { stdout, stderr };
}
