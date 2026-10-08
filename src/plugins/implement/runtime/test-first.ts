import type { RepoProfile } from "../../../plugin-api.ts";

/** A shell command of this implement epoch, in the order it ran. */
export interface CommandEvidence { command: string; exitCode: number }

/** Test-first evidence from recorded commands, no extra builds: for each plan step that lists `tests`, the test commands (per the profile's `isTestCommand`) that mention one of its paths must include a failing run followed by a passing run, and the last of them must pass. Skipped for a profile without `isTestCommand`. Which commit holds the test is the plan's business. */
export function testFirstProblems(plan: { title: string; tests: string[] }[], runs: CommandEvidence[], profile: Pick<RepoProfile, "isTestCommand">): string[] {
  if (!profile.isTestCommand) return [];
  const problems: string[] = [];
  for (const step of plan) {
    if (step.tests.length === 0) continue;
    const mine = runs.filter((run) => profile.isTestCommand!(run.command) && step.tests.some((path) => run.command.includes(path)));
    const where = `Step "${step.title}" (${step.tests.join(", ")})`;
    const firstFail = mine.findIndex((run) => run.exitCode !== 0);
    if (mine.length === 0) problems.push(`${where}: no run of a test command naming the test was recorded; run it before the fix (it must fail) and after it (it must pass)`);
    else if (firstFail < 0) problems.push(`${where}: every run passed; the new test must fail before the fix`);
    else if (!mine.slice(firstFail + 1).some((run) => run.exitCode === 0) || mine.at(-1)!.exitCode !== 0) problems.push(`${where}: a failing run must be followed by a passing run, and the last run must pass`);
  }
  return problems;
}
