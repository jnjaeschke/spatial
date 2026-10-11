import type { DiagramData, DiffData, SequenceLane, SequenceStep } from "../shared/types.ts";

export type SequenceStepProposal = Omit<SequenceStep, "verified" | "text">;
export type SequenceProposal = { commit: number; title: string; summary: string; lanes: SequenceLane[]; steps: SequenceStepProposal[]; before: SequenceStepProposal[] | null };

const sequenceStatuses = new Set(["new", "changed", "existing", "removed"]);
/** Checks whether an unknown value has the shape of a sequence proposal. */
export function isDiagram(value: unknown): value is SequenceProposal {
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
/** JSON schema for a sequence diagram proposal with cited steps. */
export const diagramSchema = { type: "object", additionalProperties: false, required: ["commit", "title", "summary", "lanes", "steps", "before"], properties: {
  commit: { type: "integer", minimum: 1 }, title: { type: "string" }, summary: { type: "string" },
  lanes: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label", "note"], properties: { id: { type: "string" }, label: { type: "string" }, note: { type: ["string", "null"] } } } },
  steps: { type: "array", items: stepSchema }, before: { anyOf: [{ type: "null" }, { type: "array", items: stepSchema }] },
} };

/** Checks sequence citations against the commit tree and its parent flow; `source` gives the commits and their base. */
export async function verifySequence(proposal: SequenceProposal, source: Pick<DiffData, "baseSha" | "commits">, show: (sha: string, path: string) => Promise<string>): Promise<{ ok: true; data: DiagramData } | { ok: false; error: string }> {
  if (!Number.isInteger(proposal.commit) || proposal.commit < 1 || proposal.commit > source.commits.length) return { ok: false, error: `commit must be between 1 and ${source.commits.length}` };
  if (proposal.lanes.length < 1 || proposal.lanes.length > 8) return { ok: false, error: "diagram must have between 1 and 8 lanes" };
  const laneIds = new Set<string>();
  for (const lane of proposal.lanes) { if (laneIds.has(lane.id)) return { ok: false, error: `duplicate lane id: ${lane.id}` }; laneIds.add(lane.id); }
  if (proposal.steps.length === 0) return { ok: false, error: "diagram must have at least one step" };
  if (proposal.steps.length > 30 || (proposal.before?.length ?? 0) > 30) return { ok: false, error: "diagram exceeds the limit of 30 steps" };
  for (const step of [...proposal.steps, ...(proposal.before ?? [])]) { if (!laneIds.has(step.from)) return { ok: false, error: `step references unknown lane: ${step.from}` }; if (!laneIds.has(step.to)) return { ok: false, error: `step references unknown lane: ${step.to}` }; }
  if (proposal.steps.some((step) => step.status === "removed")) return { ok: false, error: "removed steps belong in before" };
  const commitIndex = proposal.commit - 1, commit = source.commits[commitIndex]!, parentSha = commitIndex === 0 ? source.baseSha : source.commits[commitIndex - 1]!.sha;
  const cache = new Map<string, Promise<string | null>>();
  const linesAt = (sha: string, path: string): Promise<string[] | null> => { const key = `${sha}\0${path}`; let contents = cache.get(key); if (!contents) { contents = Promise.resolve().then(() => show(sha, path)).catch(() => null); cache.set(key, contents); } return contents.then((text) => text?.split(/\r?\n/) ?? null); };
  const containsSymbol = (text: string | null, symbol: string): boolean => { if (text === null || symbol.length === 0) return false; const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), before = /\w/.test(symbol[0]!) ? "(?<!\\w)" : "", last = symbol[symbol.length - 1]!, after = /\w/.test(last) ? "(?!\\w)" : ""; return new RegExp(`${before}${escaped}${after}`).test(text); };
  const verifySteps = async (steps: SequenceStepProposal[], sha: string): Promise<SequenceStep[]> => Promise.all(steps.map(async (step) => { const lines = await linesAt(sha, step.cite.path); let match = -1; for (let distance = 0; distance <= 2 && match < 0; distance++) for (const index of distance === 0 ? [step.cite.line - 1] : [step.cite.line - 1 - distance, step.cite.line - 1 + distance]) if (index >= 0 && index < (lines?.length ?? 0) && containsSymbol(lines![index]!, step.symbol)) { match = index; break; } if (match < 0) return { ...step, verified: false, text: null }; return { ...step, cite: { ...step.cite, line: match + 1 }, verified: true, text: lines![match]!.trim() }; }));
  const steps = await verifySteps(proposal.steps, commit.sha), before = proposal.before === null ? null : await verifySteps(proposal.before, parentSha);
  return { ok: true, data: { kind: "sequence", commit: commit.sha, commitIndex, title: proposal.title, summary: proposal.summary, lanes: proposal.lanes, steps, before } };
}

/** Verifies a sequence proposal about code at `baseSha`, where the base is the only commit. */
export async function verifyDiagramAtBase(proposal: unknown, baseSha: string, show: (sha: string, path: string) => Promise<string>): Promise<{ ok: true; data: DiagramData } | { ok: false; error: string }> {
  if (!isDiagram(proposal)) return { ok: false, error: "diagram has an invalid shape" };
  return verifySequence(proposal, { baseSha, commits: [{ sha: baseSha, subject: "base", body: "" }] }, show);
}
