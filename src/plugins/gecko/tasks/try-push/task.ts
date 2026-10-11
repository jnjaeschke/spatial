import { commandRunData, defineTask, runProcess, type CommandRunData, type Id } from "../../../../plugin-api.ts";
import type { TryPushData, TryPushInput } from "../../shared/types.ts";
import { splitCommand, treeherderUrl, tryCommandProblem } from "../../runtime/try-command.ts";

export const tryPush = defineTask<TryPushInput, { pushId: Id }>({
  kind: "tryPush",
  async run(ctx, { command, head }) {
    const problem = tryCommandProblem(command);
    if (problem) throw new Error(problem);
    const tip = await ctx.git.resolve("HEAD");
    if (tip !== head) throw new Error(`The checkout is at ${tip.slice(0, 12)}, not at the accepted tip ${head.slice(0, 12)}; spatial does not move the checkout`);
    if (await ctx.git.isDirty()) throw new Error("The work tree has uncommitted changes; commit or stash them before pushing to try");
    const [cmd, ...args] = splitCommand(command);
    const started = Date.now();
    // Lando may print a device-code login and wait; progress is where the user sees it. Its print() would sit in Python's pipe buffer without PYTHONUNBUFFERED.
    const out = await runProcess(cmd!, args, { stdin: "", cwd: ctx.repo, signal: ctx.signal, env: { PYTHONUNBUFFERED: "1" }, onStdoutLine: (line) => { if (line.trim()) ctx.progress({ kind: "indeterminate", message: line.trim() }); } });
    const output = out.stderr ? `${out.stdout}\n${out.stderr}` : out.stdout;
    ctx.artifacts.put<CommandRunData>("CommandRun", "verified", commandRunData(command, out.code, Date.now() - started, output, false));
    if (out.code !== 0) throw new Error(`mach try exited ${out.code}; its output is in the command run`);
    const url = treeherderUrl(output);
    if (!url) throw new Error("mach try printed no Treeherder link; its output is in the command run");
    return { pushId: ctx.artifacts.put<TryPushData>("TryPush", "verified", { command, url, head }).id };
  },
});
