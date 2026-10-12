import { readFileSync } from "node:fs";
import { type ChatThreadData, type Id, type JsonSchema, LlmOutputError, type LlmSelection, defineTask, diagramSchema, makeGitWriter, prependRepoContext, schemaErrors, verifyDiagramAtBase } from "../../../../plugin-api.ts";
import { resolveSpecReference } from "../../../spec/api.ts";
import type { AcceptanceCheck, InvestigationData } from "../../shared/types.ts";
import { verifyLocations } from "../../runtime/locations.ts";
import { verifyChecks } from "../../runtime/checks.ts";
import { steerSections, steersOf } from "../../runtime/steers.ts";
import { memorySections } from "../../runtime/memories.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const BASE_SCHEMA = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8")) as JsonSchema & { required: string[]; properties: Record<string, JsonSchema> };
const SCHEMA = { ...BASE_SCHEMA, required: [...BASE_SCHEMA.required, "diagram"], properties: { ...BASE_SCHEMA.properties, diagram: { anyOf: [{ type: "null" }, diagramSchema] } } };
const MAX_RETRIES = 2;

/** Input of the investigate phase and task. `previous` is set on a revision: the Investigation to improve and the user's text. */
export interface InvestigateInput { request: string; profile: string; baseSha: string; branch: string; previous?: { id: Id; text: string | null }; llm?: LlmSelection }

interface RawCheck { kind: AcceptanceCheck["kind"]; path: string | null; subtests: string[]; command: string | null; goal: string | null }
/** The check a reply entry names, or why it is unusable. */
function toCheck(raw: RawCheck): AcceptanceCheck | string {
  const { kind } = raw;
  if (kind === "measure") return raw.command && raw.goal ? { kind, command: raw.command, goal: raw.goal } : "measure: needs a command and a goal";
  if (!raw.path) return `${kind}: needs a path`;
  return kind === "failing-test" ? { kind, path: raw.path, subtests: raw.subtests } : { kind, path: raw.path };
}

interface Reply {
  kind: InvestigationData["kind"]; summary: string; bug: number | null; locations: InvestigationData["locations"];
  testCases: { description: string; expected: string; actual: string | null; path: string | null }[];
  architecture: string | null; steps: { title: string; message: string; intent: string; checks: RawCheck[] }[]; openQuestions: string[]; exploration: InvestigationData["exploration"];
  specUrls: string[]; diagram: unknown;
}
const problemsOf = (value: unknown, profile: { id: string; commitStyle: "stack" | "single" }): string[] => {
  const shape = schemaErrors(BASE_SCHEMA, value);
  if (shape.length) return shape;
  const { steps } = value as Reply;
  return [
    ...(steps.length === 0 ? ["The investigation has no steps"] : []),
    ...(profile.commitStyle === "single" && steps.length > 1 ? [`The ${profile.id} profile takes one commit but the plan has ${steps.length} steps`] : []),
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
      ...steerSections(steersOf(view.artifacts, ctx.epoch).map((steer) => steer.data.text), false),
      ...memorySections(ctx, "investigate", null),
      "# Request", request,
      "# Checkout", `Branch ${branch}, based on ${baseSha}.`,
      "# Commit style", `${profile.description}\n${profile.commitStyle === "single" ? "The repository takes ONE commit: plan exactly one step." : "Plan a stack: one step per commit. A step that adds a `new-test` comes before the step that fixes the behaviour."}`,
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
    const steps: InvestigationData["steps"] = [], droppedChecks: string[] = [], added = new Set<string>();
    for (const step of reply.steps) {
      const named: AcceptanceCheck[] = [];
      for (const raw of step.checks) {
        const check = toCheck(raw);
        if (typeof check === "string") droppedChecks.push(`${step.title}: ${check}`);
        else named.push(check);
      }
      const { verified: checks, dropped: reasons } = await verifyChecks(named, (path) => ctx.git.show(baseSha, path), added);
      droppedChecks.push(...reasons.map((reason) => `${step.title}: ${reason}`));
      for (const check of checks) if (check.kind === "new-test") added.add(check.path);
      steps.push({ title: step.title, message: step.message, intent: step.intent, checks });
    }
    const specRefs: NonNullable<InvestigationData["specRefs"]> = [];
    for (const url of reply.specUrls) specRefs.push(await resolveSpecReference(ctx, url, "llm"));
    const checked = reply.diagram === null || reply.diagram === undefined ? null : await verifyDiagramAtBase(reply.diagram, baseSha, (sha, path) => ctx.git.show(sha, path));
    const bug = reply.bug !== null && new RegExp(`(?<!\\d)${reply.bug}(?!\\d)`).test(request) ? reply.bug : null;
    const data: InvestigationData = {
      kind: reply.kind, summary: reply.summary, bug, locations: verified,
      testCases: reply.testCases.map((t) => ({ description: t.description, expected: t.expected, ...(t.actual !== null && t.actual !== undefined ? { actual: t.actual } : {}), ...(t.path !== null && t.path !== undefined ? { path: t.path } : {}) })),
      ...(reply.architecture ? { architecture: reply.architecture } : {}),
      steps, openQuestions: reply.openQuestions, exploration: reply.exploration,
      ...(specRefs.length ? { specRefs } : {}),
      ...(checked?.ok ? { diagram: checked.data } : {}),
      ...(dropped.length ? { droppedLocations: dropped } : {}),
      ...(droppedChecks.length ? { droppedChecks } : {}),
      ...(checked && !checked.ok ? { diagramError: checked.error } : {}),
    };
    return { investigationId: ctx.artifacts.put<InvestigationData>("Investigation", "proposed", data, r.selection).id, droppedLocations: dropped };
  },
});
