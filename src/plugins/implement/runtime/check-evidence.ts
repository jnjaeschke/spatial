import { escapeRegex, type Id, type RepoProfile } from "../../../plugin-api.ts";
import type { AcceptanceCheck, CheckResult } from "../shared/types.ts";
import { describeCheck, isWptTest } from "../shared/acceptance.ts";

/** A shell command of this implement epoch, in the order it ran; `edited` is whether the agent had edited a file before it. */
export interface CommandEvidence { id: Id; command: string; exitCode: number; edited: boolean }

const namesPath = (command: string, path: string) => {
  const candidates = [path];
  const wptPrefix = "testing/web-platform/tests/";
  if (path.startsWith(wptPrefix)) candidates.push(path.slice(wptPrefix.length));
  return candidates.some((candidate) => new RegExp(`(?:^|[\\s'\"])${escapeRegex(candidate)}(?:$|[\\s'\"])`).test(command));
};

const runsOf = (check: AcceptanceCheck, runs: CommandEvidence[], profile: Pick<RepoProfile, "isTestCommand">) =>
  check.kind === "measure" ? runs.filter((run) => run.command.trim() === check.command.trim()) : runs.filter((run) => profile.isTestCommand!(run.command) && namesPath(run.command, check.path));

const runCount = (mine: CommandEvidence[]) => `${mine.length} run${mine.length === 1 ? "" : "s"}`;
const measureMessage = (mine: CommandEvidence[]) => mine.length === 0 ? "not run" : mine.some((run) => !run.edited) && mine.some((run) => run.edited) ? `${runCount(mine)}: before and after the first edit` : runCount(mine);

function problemOf(check: Exclude<AcceptanceCheck, { kind: "measure" }>, mine: CommandEvidence[], first: boolean): string | null {
  const last = mine.at(-1);
  if (!first) return last && last.exitCode !== 0 ? "the last run failed; it must pass" : null;
  if (!last) return `no run of a test command naming the test was recorded; ${check.kind === "new-test" ? "run it before the fix (it must fail) and after it (it must pass)" : "run it after your change (it must pass)"}`;
  if (last.exitCode !== 0) return "the last run failed; it must pass";
  const firstFail = mine.findIndex((run) => run.exitCode !== 0), firstPass = mine.findIndex((run) => run.exitCode === 0);
  if (check.kind === "new-test" && firstFail < 0) return "every run passed; the new test must fail before the fix";
  if (check.kind === "failing-test" && !isWptTest(check.path) && (firstFail < 0 || firstFail > firstPass)) return "no failing run before the first passing run; run the test before changing the code (it must fail at the base)";
  return null;
}

/** Judges the plan's acceptance checks from the commands of one implement epoch. `first` is the epoch that starts the work; later epochs only need a passing last run for checks they ran. A test check is judged only when the profile can tell test commands (`isTestCommand`). A `measure` is never a problem: its result only reports the runs found. Problems go back to the agent; results go into a `CheckResults` artifact. */
export function checkEvidence(plan: { title: string; checks: AcceptanceCheck[] }[], runs: CommandEvidence[], { first, profile }: { first: boolean; profile: Pick<RepoProfile, "isTestCommand"> }): { problems: string[]; results: CheckResult[] } {
  const problems: string[] = [], results: CheckResult[] = [];
  plan.forEach((step, stepIndex) => step.checks.forEach((check, checkIndex) => {
    if (check.kind !== "measure" && !profile.isTestCommand) return;
    const mine = runsOf(check, runs, profile);
    const label = describeCheck(check), ids = mine.map((run) => run.id);
    if (check.kind === "measure") { results.push({ step: stepIndex, check: checkIndex, label, ok: true, message: measureMessage(mine), runs: ids }); return; }
    const problem = problemOf(check, mine, first);
    results.push({ step: stepIndex, check: checkIndex, label, ok: problem === null, message: problem ?? (mine.length === 0 ? "not run in this epoch" : `${runCount(mine)}, the last passed`), runs: ids });
    if (problem !== null) problems.push(`Step "${step.title}", ${describeCheck(check)}: ${problem}`);
  }));
  return { problems, results };
}
