import type { ChatReplyField } from "../../../plugin-api.ts";

const REF = /^[A-Za-z0-9-]+#\S+$/;
const SHAPE_ERROR = "specExplore needs 1 to 5 SPEC#anchor refs";

/** Chat reply field proposing a spec exploration; the reply shows an Explore button for it. */
export const specExploreField: ChatReplyField = {
  name: "specExplore", label: "Spec exploration",
  schema: { type: "object", additionalProperties: false, required: ["anchors"], properties: { anchors: { type: "array", items: { type: "string" } } } },
  prompt: `## Spec exploration

Set \`specExplore\` only when the question is about how a web spec algorithm flows (what it calls, in which order, under which conditions); otherwise use \`null\`. \`anchors\` are 1 to 5 spec sections as \`SPEC#anchor\` refs, the most relevant first. The user decides whether to open them.`,
  async accept(ctx, value) {
    const anchors = (value as { anchors?: unknown }).anchors;
    if (!Array.isArray(anchors) || anchors.length < 1 || anchors.length > 5 || !anchors.every((anchor) => typeof anchor === "string" && REF.test(anchor))) return { ok: false, error: SHAPE_ERROR };
    for (const anchor of anchors as string[]) {
      const result = await ctx.webspec.query(anchor, ctx.signal);
      if (!result.found) return { ok: false, error: `unknown spec section ${anchor}: ${result.reason}` };
    }
    return { ok: true, artifacts: [{ type: "SpecExploreRequest", data: { anchors } }] };
  },
};
