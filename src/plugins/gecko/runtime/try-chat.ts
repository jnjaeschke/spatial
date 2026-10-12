import { isGeckoRepo, type ChatReplyField } from "../../../plugin-api.ts";
import type { TryInput } from "../shared/types.ts";
import { isTryProposal, tryCommandProblem } from "./try-command.ts";

/** Chat reply field: the user asked to push to try; the try phase stores the proposal and asks Push/Skip. */
export const tryField: ChatReplyField = {
  name: "tryPush", label: "Try push",
  schema: { type: "object", additionalProperties: false, required: ["command", "reason"], properties: { command: { type: "string" }, reason: { type: "string" } } },
  prompt: `## Try pushes

Set \`tryPush\` only when the user asks to push to try (or to run try jobs) in a Firefox checkout; otherwise use \`null\`. Nothing is pushed by your answer: the user sees the command and pushes or skips it. The push sends the checkout's commits up to HEAD. Use one command: \`./mach try fuzzy --query '<fzf query>'\` (repeat \`--query\` as needed; add \`--artifact\` when no compiled code changed), \`./mach try --preset <name>\` (presets are in \`tools/tryselect/try_presets.yml\`) or \`./mach try auto\`. Never a bare \`./mach try fuzzy\`, \`;\`, \`&&\`, pipes, redirections or \`$\`. Pick jobs that cover the changed files and their tests; say why in \`reason\`.`,
  async accept(ctx, value) {
    if (!isTryProposal(value)) return { ok: false, error: "tryPush has an invalid shape" };
    if (!isGeckoRepo(ctx.repo)) return { ok: false, error: "Try pushes need a Gecko checkout" };
    const command = value.command.trim(), problem = tryCommandProblem(command);
    if (problem) return { ok: false, error: problem };
    const input: TryInput = { head: await ctx.git.resolve("HEAD"), proposal: { command, reason: value.reason } };
    return { ok: true, artifacts: [], run: { phase: "try", input } };
  },
};
