import type { ChatReplyField } from "../../../plugin-api.ts";
import { isSpecRef } from "../shared/refs.ts";
import type { TraceQuestion } from "../shared/types.ts";
const SHAPE_ERROR = "specExplore needs 1 to 5 SPEC#anchor refs";

/** Chat reply field proposing a spec exploration; the reply shows an Explore button for it. */
export const specExploreField: ChatReplyField = {
  name: "specExplore", label: "Spec exploration",
  schema: { type: "object", additionalProperties: false, required: ["anchors", "question"], properties: { anchors: { type: "array", items: { type: "string" } }, question: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["mode", "text"], properties: { mode: { type: "string", enum: ["claim", "scenario"] }, text: { type: "string" } } }] } } },
  prompt: `## Spec exploration

Set \`specExplore\` only when the question is about how a web spec algorithm flows (what it calls, in which order, under which conditions); otherwise use \`null\`. \`anchors\` are 1 to 5 spec sections as \`SPEC#anchor\` refs, the most relevant first. Set \`question\` when the user asks whether something holds in those algorithms (\`{ "mode": "claim", "text": <the claim> }\`) or what happens in a situation (\`{ "mode": "scenario", "text": <the situation> }\`); the explorer then traces it. Otherwise \`null\`. The user decides whether to open them.`,
  async accept(ctx, value) {
    const anchors = typeof value === "object" && value !== null ? (value as { anchors?: unknown }).anchors : undefined;
    if (!Array.isArray(anchors) || anchors.length < 1 || anchors.length > 5 || !anchors.every((anchor) => typeof anchor === "string" && isSpecRef(anchor))) return { ok: false, error: SHAPE_ERROR };
    for (const anchor of anchors as string[]) {
      const result = await ctx.webspec.query(anchor, ctx.signal);
      if (!result.found) return { ok: false, error: `unknown spec section ${anchor}: ${result.reason}` };
    }
    const question = (value as { question?: unknown }).question;
    const q = question as { mode?: unknown; text?: unknown } | null | undefined;
    if (q !== null && (typeof q !== "object" || (q.mode !== "claim" && q.mode !== "scenario") || typeof q.text !== "string" || !q.text.trim())) return { ok: false, error: 'specExplore.question must be null or { mode: "claim" | "scenario", text }' };
    return { ok: true, artifacts: [{ type: "SpecExploreRequest", data: { anchors, question: q === null ? null : { mode: q.mode as TraceQuestion["mode"], text: q.text as string } } }] };
  },
};
