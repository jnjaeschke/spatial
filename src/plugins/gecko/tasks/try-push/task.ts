import { defineTask, type Id } from "../../../../plugin-api.ts";
import type { TryPushData, TryPushInput } from "../../shared/types.ts";
import { assertAtTip, runRecorded } from "../../runtime/recorded-command.ts";
import { splitCommand, treeherderUrl, tryCommandProblem } from "../../runtime/try-command.ts";

export const tryPush = defineTask<TryPushInput, { pushId: Id }>({
  kind: "tryPush",
  async run(ctx, { command, head }) {
    const problem = tryCommandProblem(command);
    if (problem) throw new Error(problem);
    await assertAtTip(ctx, head, "pushing to try");
    const [cmd, ...args] = splitCommand(command);
    // Lando may print a device-code login and wait; progress is where the user sees it. Its print() would sit in Python's pipe buffer without PYTHONUNBUFFERED.
    const output = await runRecorded(ctx, "mach try", command, cmd!, args, { PYTHONUNBUFFERED: "1" });
    const url = treeherderUrl(output);
    if (!url) throw new Error("mach try printed no Treeherder link; its output is in the command run");
    return { pushId: ctx.artifacts.put<TryPushData>("TryPush", "verified", { command, url, head }).id };
  },
});
