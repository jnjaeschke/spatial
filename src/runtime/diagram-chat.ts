import type { DiagramData, DiffData } from "../shared/types.ts";
import { latestDiff } from "../shared/diffs.ts";
import { verifySequence, type SequenceProposal, type SequenceStepProposal } from "./diagram-verify.ts";
import type { ChatReplyField } from "./plugins.ts";

const sequenceStatuses = new Set(["new", "changed", "existing", "removed"]);
function isDiagram(value: unknown): value is SequenceProposal {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<SequenceProposal>, nullable = (v: unknown) => v === null || typeof v === "string";
  const cite = (v: unknown) => !!v && typeof v === "object" && typeof (v as { path?: unknown }).path === "string" && Number.isInteger((v as { line?: unknown }).line) && (v as { line: number }).line >= 1;
  const step = (v: unknown) => { if (!v || typeof v !== "object") return false; const s = v as SequenceStepProposal; return typeof s.from === "string" && typeof s.to === "string" && typeof s.symbol === "string" && typeof s.call === "string" && typeof s.what === "string" && nullable(s.when) && nullable(s.guard) && nullable(s.phase) && sequenceStatuses.has(s.status) && cite(s.cite); };
  return Number.isInteger(d.commit) && d.commit! >= 1 && typeof d.title === "string" && typeof d.summary === "string" && Array.isArray(d.lanes) && d.lanes.every((lane) => !!lane && typeof lane.id === "string" && typeof lane.label === "string" && nullable(lane.note)) && Array.isArray(d.steps) && d.steps.every(step) && (d.before === null || (Array.isArray(d.before) && d.before.every(step)));
}
const citeSchema = { type: "object", additionalProperties: false, required: ["path", "line"], properties: { path: { type: "string" }, line: { type: "integer", minimum: 1 } } };
const stepSchema = { type: "object", additionalProperties: false, required: ["from", "to", "symbol", "call", "what", "when", "guard", "phase", "status", "cite"], properties: {
  from: { type: "string" }, to: { type: "string" }, symbol: { type: "string" }, call: { type: "string" }, what: { type: "string" },
  when: { type: ["string", "null"] }, guard: { type: ["string", "null"] }, phase: { type: ["string", "null"] },
  status: { type: "string", enum: ["new", "changed", "existing", "removed"] }, cite: citeSchema,
} };
const diagramSchema = { type: "object", additionalProperties: false, required: ["commit", "title", "summary", "lanes", "steps", "before"], properties: {
  commit: { type: "integer", minimum: 1 }, title: { type: "string" }, summary: { type: "string" },
  lanes: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label", "note"], properties: { id: { type: "string" }, label: { type: "string" }, note: { type: ["string", "null"] } } } },
  steps: { type: "array", items: stepSchema }, before: { anyOf: [{ type: "null" }, { type: "array", items: stepSchema }] },
} };
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
