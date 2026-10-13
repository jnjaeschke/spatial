import type { DiagramData, DiffData, ChatReplyField } from "../../../plugin-api.ts";
import { diagramSchema, isDiagram, verifySequence } from "../../../plugin-api.ts";
import { latestDiff } from "../shared/diffs.ts";

export const diagramField: ChatReplyField = {
  name: "diagram", label: "Diagram", schema: diagramSchema,
  prompt: `## Sequence diagrams

Set \`diagram\` only when asked for a diagram or when a behavioural flow clearly answers; otherwise use \`null\`. Before drawing, read the commit's full patch with \`scm_diff\` and cite lines from \`scm_file\` at that commit; the working tree is the stack head, so its line numbers are wrong for earlier commits. Lanes are actors and steps are in execution order. Each step's \`symbol\` is the function, method or field name of the call exactly as it appears in the code (e.g. \`AddEarlyRunner\`), never a step label, and \`cite\` is the path and line at that commit where it appears; the runtime checks the symbol against that line and marks steps it cannot find as unverified. Use a short \`call\` as written in code, and keep \`what\` and \`when\` concrete (including timers, conditions, and timing such as before the next paint). Set status relative to the parent commit: \`new\`, \`changed\`, or \`existing\`; removed steps belong in \`before\`. Use \`guard\` for a branch condition and \`phase\` to group consecutive steps. Include \`before\` when the commit changes an existing flow; otherwise use null. Use 1–8 lanes and at most 30 steps in each list. Never invent steps that are not in the code. If no sequence fits the patch (pure refactor, data-structure change, renames), set \`diagram\` to null and say why in \`answer\`.`,
  async accept(ctx, value) {
    if (!isDiagram(value)) return { ok: false, error: "diagram has an invalid shape" };
    const diffArtifact = latestDiff(ctx.artifacts.view().artifacts);
    if (!diffArtifact) return { ok: false, error: "there is no reviewed commit range" };
    const result = await verifySequence(value, diffArtifact.data as DiffData, (sha, path) => ctx.git.show(sha, path));
    return result.ok ? { ok: true, artifacts: [{ type: "Diagram", data: result.data as DiagramData }] } : { ok: false, error: result.error };
  },
};
