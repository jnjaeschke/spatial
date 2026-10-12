import { readFileSync } from "node:fs";
import { type Artifact, type CommandRunData, type Id, type JsonSchema, type LlmEvent, type LlmSelection, type WriteMode, commandRunData, defineTask, makeGitWriter, prependRepoContext, runProcess, schemaErrors } from "../../../../plugin-api.ts";
import type { AgentSessionData, CheckResultsData, ImplementBranchData, ImplementResultData, InvestigationData, StackRewriteData } from "../../shared/types.ts";
import { requireCheckoutOn } from "../../branch.ts";
import { requireEditsOnlyReady, requireProfile } from "../../profiles.ts";
import { describeCheck } from "../../shared/acceptance.ts";
import { describeFinding } from "../../runtime/findings.ts";
import { feedbackSections } from "../../runtime/feedback.ts";
import { verifyStack } from "../../runtime/verify-stack.ts";
import { checkEvidence, type CommandEvidence } from "../../runtime/check-evidence.ts";
import { runEditsOnly, type AgentReply } from "../../runtime/edits-only.ts";
import { steerPlan, steerSections } from "../../runtime/steers.ts";
import { memorySections } from "../../runtime/memories.ts";
import type { ReviewFindingData } from "../../../review/api.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8")) as JsonSchema;
const MAX_RETRIES = 2;

/** Input of the implement phase and task: the approved Investigation and what else the agent should address. `fix` lists the open high findings this round was asked to fix; the next review gives a verdict on each. */
export interface ImplementInput { branchId: Id; investigationId: Id; bug: number | null; text: string | null; fix: Id[]; ignorePlanInvalid?: boolean; llm?: LlmSelection; writeMode: WriteMode }
/** The planned commit message with the real bug number in place of `Bug N`. */
export const withBug = (message: string, bug: number | null) => bug === null ? message : message.replace(/^Bug N\b/, `Bug ${bug}`);

export const implement = defineTask<ImplementInput, { resultId: Id }>({
  kind: "implement",
  async run(ctx, input) {
    const branch = ctx.artifacts.get<ImplementBranchData>(input.branchId).data;
    const profile = requireProfile(ctx.repoProfiles, branch.profile);
    if (profile.requiresBug && input.bug === null) throw new Error(`The ${profile.id} profile needs a bug number`);
    requireEditsOnlyReady(profile, input.writeMode);
    const investigation = ctx.artifacts.get<InvestigationData>(input.investigationId).data;
    const planned = investigation.steps.map((step) => ({ message: withBug(step.message, input.bug), checks: step.checks }));
    const writer = makeGitWriter(ctx.repo);
    const view = ctx.artifacts.view();
    const steer = steerPlan(view.artifacts, ctx.epoch);
    const previous = (view.artifacts.filter((a) => a.type === "ImplementResult") as Artifact<ImplementResultData>[]).at(-1);

    const current = await writer.currentBranch();
    requireCheckoutOn(current, branch.branch);
    const tip = await ctx.git.resolve("HEAD");
    const rewrite = view.artifacts.slice(previous ? view.artifacts.indexOf(previous) + 1 : 0).findLast((a) => a.type === "StackRewrite") as Artifact<StackRewriteData> | undefined;
    const expected = rewrite?.data.to ?? previous?.data.head;
    if (expected && !(await ctx.git.isAncestor(expected, tip))) throw new Error(`${branch.branch} moved away from ${expected.slice(0, 12)} since the last implement run; spatial does not move the checkout back`);

    const fix = input.fix.map((id) => {
      const finding = ctx.artifacts.get<ReviewFindingData>(id);
      if (finding.type !== "ReviewFinding") throw new Error(`Artifact ${id} is not a ReviewFinding (got ${finding.type})`);
      return finding;
    });
    const since = previous?.epoch ?? -1;
    const fresh = (a: Artifact) => (a.epoch ?? 0) > since;
    const feedback = feedbackSections({
      text: input.text,
      notes: view.artifacts.filter((a) => a.type === "Note" && fresh(a)).map((a) => (a.data as { body: string }).body),
      threads: view.artifacts.filter((a) => a.type === "ChatThread" && fresh(a)).map((a) => ctx.artifacts.render(a.id)),
      findings: fix.map(describeFinding),
    });
    const prompt = [
      ...steerSections(steer.all, true),
      ...(steer.resume ? [] : memorySections(ctx, "implement", investigation.kind)),
      "# Investigation", ctx.artifacts.render(input.investigationId),
      "# Checkout", `Branch ${branch.branch}, base ${branch.baseSha}.${input.bug !== null ? ` Bug ${input.bug}.` : ""}\n${profile.description}`,
      ...(await ctx.git.isDirty() ? ["# Uncommitted changes", "The work tree has uncommitted changes from an earlier run; they are yours to keep, adjust or revert."] : []),
      ...(input.ignorePlanInvalid ? ["# Plan", "The user decided to continue with the plan anyway. Do not report the plan as invalid."] : []),
      ...feedback,
    ].join("\n\n");

    const selection = input.llm ?? ctx.llm.defaultSelection;
    const evidence: CommandEvidence[] = [];
    let edited = false;
    let recorded: string | undefined;
    let session = steer.resume?.providerSessionId;
    let steerPrompt = steer.resume ? steerSections(steer.resume.steers, true).join("\n\n") : null;
    let firstCall = true;
    const onEvent = (event: LlmEvent) => {
      if (event.kind === "progress") {
        if (event.message.startsWith("editing ")) edited = true;
        ctx.progress({ kind: "indeterminate", message: event.message });
      }
      else if (event.kind === "session") {
        if (event.providerSessionId === recorded) return;
        recorded = event.providerSessionId;
        ctx.artifacts.put<AgentSessionData>("AgentSession", "verified", { providerSessionId: event.providerSessionId, backend: selection.backend, model: selection.model, resumed: session !== undefined });
      }
      else if (event.kind === "command") {
        const run = ctx.artifacts.put<CommandRunData>("CommandRun", "verified", commandRunData(event.command, event.exitCode, event.durationMs, event.output, profile.isTestCommand?.(event.command) ?? false));
        evidence.push({ id: run.id, command: event.command, exitCode: event.exitCode, edited });
      }
    };
    /** The first call starts a session with `fresh`; every later call resumes the session of the call before it with only `followUp`. */
    const call = async (fresh: string, followUp: string): Promise<AgentReply> => {
      const prompt = steerPrompt === null ? (firstCall ? fresh : followUp) : input.writeMode === "editsOnly" ? `${steerPrompt}\n\n${followUp}` : steerPrompt;
      steerPrompt = null;
      firstCall = false;
      const r = await ctx.llm.run({ prompt, system: prependRepoContext(SYSTEM, ctx), schema: SCHEMA, cwd: ctx.repo, tools: "write", writeMode: input.writeMode, onEvent, resumeProviderSession: session, mcpServers: { ...ctx.sessionMcp, ...ctx.repoMcp } }, input.llm);
      session = r.providerSessionId;
      const errors = schemaErrors(SCHEMA, r.json);
      if (errors.length) throw new Error(`Implement reply is not valid: ${errors.join("; ")}`);
      return r.json as AgentReply;
    };
    const problemsSection = (list: string[]) => `# Problems to fix\n${list.map((problem) => `- ${problem}`).join("\n")}`;
    const done = async (head: string, reply: AgentReply, planChange: string | null, planInvalid: string | null) =>
      ({ resultId: ctx.artifacts.put<ImplementResultData>("ImplementResult", "verified", { head, branch: branch.branch, summary: reply.summary, planChange, planInvalid }).id });

    if (input.writeMode === "editsOnly") {
      const existing = await ctx.git.log(branch.baseSha, "HEAD");
      const commitSubjects = existing.map((commit) => commit.subject);
      const checksLine = (index: number) => { const { checks } = investigation.steps[index]!; return checks.length ? ` Checks: ${checks.map(describeCheck).join("; ")}.` : ""; };
      const step = (index: number | null, problems: string[]) => (index === null
        ? "# Edits only\n\nYou cannot run commands. Edit the files that address the feedback and set `step` to the 0-based index of the commit (oldest first) the edits belong to:\n" + commitSubjects.map((subject, i) => `${i}: ${subject}`).join("\n")
        : `# Edits only\n\nYou cannot run commands. Implement ONLY plan step ${index + 1} of ${planned.length}: ${investigation.steps[index]!.title} (${investigation.steps[index]!.intent}).${checksLine(index)} The runtime builds, runs the tests and commits.`)
        + (problems.length ? `\n\n${problemsSection(problems)}` : "");
      const runCheck = async (command: string) => {
        const started = Date.now();
        const out = await runProcess("sh", ["-c", command], { stdin: "", cwd: ctx.repo, signal: ctx.signal });
        const output = out.stdout + out.stderr;
        const run = ctx.artifacts.put<CommandRunData>("CommandRun", "verified", commandRunData(command, out.code, Date.now() - started, output, true));
        return { id: run.id, exitCode: out.code, output };
      };
      const outcome = await runEditsOnly({
        plan: planned, baseSha: branch.baseSha, bugfix: investigation.kind === "bugfix", maxRetries: MAX_RETRIES,
        ...(profile.buildCommand ? { buildCommand: profile.buildCommand } : {}), testCommand: profile.testCommand!, runCheck,
        onResults: (results) => { if (results.length) ctx.artifacts.put<CheckResultsData>("CheckResults", "verified", { results }); },
        agent: async ({ step: index, problems }) => {
          const reply = await call([prompt, step(index, problems)].join("\n\n"), step(index, problems));
          return input.ignorePlanInvalid ? { ...reply, planInvalid: null } : reply;
        },
        git: { changedPaths: () => writer.changedPaths(), commitAll: (message) => writer.commitAll(message), fixup: (target, base) => writer.fixup(target, base), commits: async () => (await ctx.git.log(branch.baseSha, "HEAD")).map(({ sha, subject }) => ({ sha, subject })) },
      });
      if (outcome.planInvalid) return done(await ctx.git.resolve("HEAD"), { summary: outcome.summary, planChange: null, planInvalid: outcome.planInvalid, step: null }, null, outcome.planInvalid);
      const checked = await verifyStack(ctx.git, await writer.currentBranch(), { baseSha: branch.baseSha, branch: branch.branch, plan: branch.checkout === "new-branch" ? planned : null, planChange: outcome.planChange, profile });
      if (checked.problems.length) throw new Error(`The edits-only stack has problems:\n${checked.problems.join("\n")}`);
      return done(checked.head, { summary: outcome.summary, planChange: outcome.planChange, planInvalid: null, step: null }, outcome.planChange, null);
    }
    let problems: string[] = [];
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const reply = await call(attempt === 0 ? prompt : [prompt, problemsSection(problems)].join("\n\n"), problemsSection(problems));
      if (reply.planInvalid && !input.ignorePlanInvalid) return done(await ctx.git.resolve("HEAD"), reply, null, reply.planInvalid);
      const checked = await verifyStack(ctx.git, await writer.currentBranch(), { baseSha: branch.baseSha, branch: branch.branch, plan: branch.checkout === "new-branch" ? planned : null, planChange: reply.planChange, profile });
      const judged = checkEvidence(investigation.steps, evidence, { first: !previous, profile });
      if (judged.results.length) ctx.artifacts.put<CheckResultsData>("CheckResults", "verified", { results: judged.results });
      const found = [...checked.problems, ...judged.problems];
      if (found.length === 0) return done(checked.head, reply, reply.planChange, null);
      problems = found;
    }
    throw new Error(`The agent's stack still has problems after ${MAX_RETRIES} retries:\n${problems.join("\n")}`);
  },
});
