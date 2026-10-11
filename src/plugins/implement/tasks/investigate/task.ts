import { readFileSync } from "node:fs";
import { type ChatThreadData, type Id, type LlmSelection, defineTask, diagramSchema, makeGitWriter, prependRepoContext, verifyDiagramAtBase } from "../../../../plugin-api.ts";
import { resolveSpecReference } from "../../../spec/api.ts";
import type { InvestigationData } from "../../shared/types.ts";
import { verifyLocations } from "../../runtime/locations.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const BASE_SCHEMA = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8")) as { required: string[]; properties: Record<string, unknown> };
const SCHEMA = { ...BASE_SCHEMA, required: [...BASE_SCHEMA.required, "diagram"], properties: { ...BASE_SCHEMA.properties, diagram: { anyOf: [{ type: "null" }, diagramSchema] } } };
const KINDS = ["bugfix", "feature", "spec", "perf"];

/** Input of the investigate phase and task. `previous` is set on a revision: the Investigation to improve and the user's text. */
export interface InvestigateInput { request: string; profile: string; baseSha: string; branch: string; previous?: { id: Id; text: string | null }; llm?: LlmSelection }

interface Reply {
  kind: InvestigationData["kind"]; summary: string; bug: number | null; locations: InvestigationData["locations"];
  testCases: { description: string; expected: string; actual: string | null; path: string | null }[];
  architecture: string | null; steps: InvestigationData["steps"]; openQuestions: string[]; exploration: InvestigationData["exploration"];
  specUrls: string[]; diagram: unknown;
}
const isReply = (value: unknown): value is Reply => {
  const r = value as Partial<Reply> | null | undefined;
  return typeof r === "object" && r !== null && KINDS.includes(r.kind as string) && typeof r.summary === "string" && (r.bug === null || Number.isInteger(r.bug))
    && Array.isArray(r.locations) && r.locations.every((l) => typeof l?.path === "string" && Number.isInteger(l.line) && typeof l.quote === "string" && typeof l.why === "string")
    && Array.isArray(r.testCases) && r.testCases.every((t) => typeof t?.description === "string" && typeof t.expected === "string")
    && Array.isArray(r.steps) && r.steps.every((s) => typeof s?.title === "string" && typeof s.message === "string" && typeof s.intent === "string" && Array.isArray(s.tests))
    && Array.isArray(r.openQuestions) && Array.isArray(r.exploration) && r.exploration.every((e) => typeof e?.tried === "string" && typeof e.outcome === "string")
    && Array.isArray(r.specUrls) && r.specUrls.every((url) => typeof url === "string");
};

export const investigate = defineTask<InvestigateInput, { investigationId: Id; droppedLocations: string[] }>({
  kind: "investigate",
  async run(ctx, { request, profile: profileId, baseSha, branch, previous, llm }) {
    const profile = ctx.repoProfiles.get(profileId);
    if (!profile) throw new Error(`Unknown repo profile: ${profileId}`);
    const current = await makeGitWriter(ctx.repo).currentBranch();
    if (current !== branch) throw new Error(`The checkout is on ${current ?? "a detached HEAD"}, not on ${branch}; spatial does not switch branches for you`);
    const view = ctx.artifacts.view();
    const threads = previous ? view.artifacts.filter((a) => a.type === "ChatThread" && (a.data as ChatThreadData).anchor.split("#")[0] === previous.id) : [];
    const prompt = [
      "# Request", request,
      "# Checkout", `Branch ${branch}, based on ${baseSha}.`,
      "# Commit style", `${profile.description}\n${profile.commitStyle === "single" ? "The repository takes ONE commit: plan exactly one step." : "Plan a stack: one step per commit. For a bug fix the first step adds the failing test."}`,
      ...(previous ? [
        "# Previous investigation", ctx.artifacts.render(previous.id),
        ...(previous.text ? ["# Revision request", previous.text] : []),
        ...(threads.length ? ["# Chat threads on the previous investigation", ...threads.map((thread) => ctx.artifacts.render(thread.id))] : []),
      ] : []),
    ].join("\n\n");
    const r = await ctx.llm.run({ prompt, system: prependRepoContext(SYSTEM, ctx), schema: SCHEMA, cwd: ctx.repo, tools: "read-only", mcpServers: { ...ctx.sessionMcp, ...ctx.repoMcp } }, llm);
    if (!isReply(r.json)) throw new Error(`Investigation reply is not valid: ${JSON.stringify(r.json)}`);
    const reply = r.json;
    if (reply.steps.length === 0) throw new Error("The investigation has no steps");
    if (profile.commitStyle === "single" && reply.steps.length > 1) throw new Error(`The ${profile.id} profile takes one commit but the plan has ${reply.steps.length} steps`);
    const { verified, dropped } = await verifyLocations(reply.locations, (path) => ctx.git.show(baseSha, path));
    const specRefs: NonNullable<InvestigationData["specRefs"]> = [];
    for (const url of reply.specUrls) specRefs.push(await resolveSpecReference(ctx, url, "llm"));
    const checked = reply.diagram === null || reply.diagram === undefined ? null : await verifyDiagramAtBase(reply.diagram, baseSha, (sha, path) => ctx.git.show(sha, path));
    const bug = reply.bug !== null && new RegExp(`(?<!\\d)${reply.bug}(?!\\d)`).test(request) ? reply.bug : null;
    const data: InvestigationData = {
      kind: reply.kind, summary: reply.summary, bug, locations: verified,
      testCases: reply.testCases.map((t) => ({ description: t.description, expected: t.expected, ...(t.actual !== null && t.actual !== undefined ? { actual: t.actual } : {}), ...(t.path !== null && t.path !== undefined ? { path: t.path } : {}) })),
      ...(reply.architecture ? { architecture: reply.architecture } : {}),
      steps: reply.steps, openQuestions: reply.openQuestions, exploration: reply.exploration,
      ...(specRefs.length ? { specRefs } : {}),
      ...(checked?.ok ? { diagram: checked.data } : {}),
      ...(dropped.length ? { droppedLocations: dropped } : {}),
      ...(checked && !checked.ok ? { diagramError: checked.error } : {}),
    };
    return { investigationId: ctx.artifacts.put<InvestigationData>("Investigation", "proposed", data, r.selection).id, droppedLocations: dropped };
  },
});
