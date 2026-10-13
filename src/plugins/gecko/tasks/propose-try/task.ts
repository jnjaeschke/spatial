import { readFileSync } from "node:fs";
import { loadSchema, defineTask, prependRepoContext, runStructured, type CommandRunData, type Id } from "../../../../plugin-api.ts";
import type { TryInput, TryProposalData, TryPushData } from "../../shared/types.ts";
import { tryCommandProblem } from "../../runtime/try-command.ts";
import { changedFiles } from "../../runtime/changed-files.ts";

const SYSTEM = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const SCHEMA = loadSchema(import.meta.url);
const MAX_TEST_COMMANDS = 20;

export const proposeTry = defineTask<TryInput, { proposalId: Id }>({
  kind: "proposeTry",
  async run(ctx, input) {
    if ("proposal" in input) {
      const problem = tryCommandProblem(input.proposal.command);
      if (problem) throw new Error(`The proposed try command is not usable: ${problem}: ${input.proposal.command}`);
      return { proposalId: ctx.artifacts.put<TryProposalData>("TryProposal", "proposed", input.proposal).id };
    }
    const { base, head, llm } = input;
    const earlier = ctx.artifacts.view().artifacts.filter((a) => a.type === "TryPush").map((a) => (a.data as TryPushData).command);
    const [diff, commits] = await Promise.all([ctx.git.diff(base, head), ctx.git.log(base, head)]);
    const tests = [...new Map(ctx.artifacts.view().artifacts
      .filter((a) => a.type === "CommandRun" && (a.data as CommandRunData).test)
      .map((a) => a.data as CommandRunData)
      .map((run) => [run.command, run] as const)).values()].slice(-MAX_TEST_COMMANDS);
    const prompt = [
      "# Commits", commits.map((commit) => `- ${commit.subject}`).join("\n"),
      "# Changed files", changedFiles(diff).map((path) => `- ${path}`).join("\n"),
      ...(tests.length ? ["# Test commands run while implementing", tests.map((run) => `- \`${run.command}\` (exit ${run.exitCode})`).join("\n")] : []),
      ...(earlier.length ? ["# Earlier try pushes in this session", [...new Set(earlier)].map((command) => `- \`${command}\``).join("\n")] : []),
    ].join("\n\n");
    const { json, result } = await runStructured<TryProposalData>(ctx.llm, { prompt, system: prependRepoContext(SYSTEM, ctx), schema: SCHEMA, cwd: ctx.repo, tools: "read-only", mcpServers: { ...ctx.sessionMcp, ...ctx.repoMcp }, label: "Try proposal reply", repairs: 1, validate: (value) => {
      const command = (value as TryProposalData).command.trim();
      const problem = tryCommandProblem(command);
      return problem ? [`The proposed try command is not usable: ${problem}: ${command}`] : [];
    } }, llm);
    const command = json.command.trim();
    return { proposalId: ctx.artifacts.put<TryProposalData>("TryProposal", "proposed", { command, reason: json.reason }, result.selection).id };
  },
});
