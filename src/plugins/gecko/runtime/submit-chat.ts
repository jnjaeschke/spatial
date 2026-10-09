import { isGeckoRepo, type ChatReplyField } from "../../../plugin-api.ts";
import type { ImplementBranchData } from "../../implement/api.ts";
import type { SubmitInput } from "../shared/types.ts";

/** Chat reply field: the user asked to submit to Phabricator; the submit phase suggests reviewers and asks Submit / Submit as WIP / Not yet. */
export const submitField: ChatReplyField = {
  name: "phabSubmit", label: "Phabricator submit",
  schema: { type: "object", additionalProperties: false, required: ["reason"], properties: { reason: { type: "string" } } },
  prompt: `## Phabricator submits

Set \`phabSubmit\` only when the user asks to submit the stack to Phabricator (or to request review) in an implement session on a Firefox checkout; otherwise use \`null\`. Nothing is submitted by your answer: spatial suggests reviewers and the user submits or not. Put the user's request in \`reason\`.`,
  async accept(ctx, value) {
    const v = value as { reason?: unknown } | null;
    if (typeof v !== "object" || v === null || typeof v.reason !== "string") return { ok: false, error: "phabSubmit has an invalid shape" };
    if (!isGeckoRepo(ctx.repo)) return { ok: false, error: "Phabricator submits need a Gecko checkout" };
    const branch = ctx.artifacts.view().artifacts.findLast((a) => a.type === "ImplementBranch")?.data as ImplementBranchData | undefined;
    if (!branch) return { ok: false, error: "Phabricator submits need an implement session" };
    const input: SubmitInput = { base: branch.baseSha, head: await ctx.git.resolve("HEAD") };
    return { ok: true, artifacts: [], run: { phase: "submit", input } };
  },
};
