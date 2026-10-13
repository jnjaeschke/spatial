import { runRecordedCommand, type TaskContext } from "../../../plugin-api.ts";

/** Fails unless the checkout is at the accepted tip `head` with a clean tree; `action` completes "commit or stash them before …". */
export async function assertAtTip(ctx: TaskContext, head: string, action: string): Promise<void> {
  const tip = await ctx.git.resolve("HEAD");
  if (tip !== head) throw new Error(`The checkout is at ${tip.slice(0, 12)}, not at the accepted tip ${head.slice(0, 12)}; spatial does not move the checkout`);
  if (await ctx.git.isDirty()) throw new Error(`The work tree has uncommitted changes; commit or stash them before ${action}`);
}

/** Runs `bin args` in the repo, shows stdout lines as progress and stores a `CommandRun` named `command`. Throws "<name> exited N" on a non-zero exit; returns stdout joined with stderr. */
export async function runRecorded(ctx: TaskContext, name: string, command: string, bin: string, args: string[], env?: Record<string, string>): Promise<string> {
  const { result: out, output } = await runRecordedCommand(ctx, { command, bin, args, test: false, ...(env ? { env } : {}), onStdoutLine: (line) => { if (line.trim()) ctx.progress({ kind: "indeterminate", message: line.trim() }); } });
  if (out.code !== 0) throw new Error(`${name} exited ${out.code}; its output is in the command run`);
  return output;
}
