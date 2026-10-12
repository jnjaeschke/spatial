import { readFileSync } from "node:fs";
import { type ChatThreadData, type Id, LlmOutputError, type LlmSelection, defineTask, diagramSchema, makeGitWriter, prependRepoContext, verifyDiagramAtBase } from "../../../../plugin-api.ts";
import { resolveSpecReference } from "../../../spec/api.ts";
import type { InvestigationData } from "../../shared/types.ts";
import { verifyLocations } from "../../runtime/locations.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const BASE_SCHEMA = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8")) as { required: string[]; properties: Record<string, unknown> };
const SCHEMA = { ...BASE_SCHEMA, required: [...BASE_SCHEMA.required, "diagram"], properties: { ...BASE_SCHEMA.properties, diagram: { anyOf: [{ type: "null" }, diagramSchema] } } };
const KINDS = ["bugfix", "feature", "spec", "perf"];
const MAX_RETRIES = 2;

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
const problemsOf = (value: unknown, profile: { id: string; commitStyle: "stack" | "single" }): string[] => {
  if (!isReply(value)) return [`The reply is not valid: ${String(JSON.stringify(value)).slice(0, 500)}`];
  return [
    ...(value.steps.length === 0 ? ["The investigation has no steps"] : []),
    ...(profile.commitStyle === "single" && value.steps.length > 1 ? [`The ${profile.id} profile takes one commit but the plan has ${value.steps.length} steps`] : []),
  ];
};
const listProblems = (problems: string[]) => problems.map((problem) => `- ${problem}`).join("\n");

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
    const ask = (text: string, resumeProviderSession?: string) => ctx.llm.run({ prompt: text, system: prependRepoContext(SYSTEM, ctx), schema: SCHEMA, cwd: ctx.repo, tools: "read-only", resumeProviderSession, mcpServers: { ...ctx.sessionMcp, ...ctx.repoMcp } }, llm);
    const r = await (async () => {
      const attempts: string[][] = [];
      let session: string | undefined;
      let nextPrompt = prompt;
      for (;;) {
        let result: Awaited<ReturnType<typeof ask>>;
        let problems: string[];
        try {
          result = await ask(nextPrompt, session);
          session = result.providerSessionId;
          problems = problemsOf(result.json, profile);
        } catch (error) {
          if (!(error instanceof LlmOutputError)) throw error;
          session = error.providerSessionId;
          problems = [error.message];
        }
        if (problems.length === 0) return result!;
        attempts.push(problems);
        if (attempts.length > MAX_RETRIES) throw new Error(`The investigation reply still has problems after ${MAX_RETRIES} retries:\n${attempts.map((list, i) => `Attempt ${i + 1}:\n${listProblems(list)}`).join("\n")}`);
        nextPrompt = `Your answer has problems:\n${listProblems(problems)}\n\nAnswer again with the full schema.`;
      }
    })();
    const reply = r.json as Reply;
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
