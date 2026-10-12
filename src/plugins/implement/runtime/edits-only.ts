import type { Id } from "../../../plugin-api.ts";
import type { AcceptanceCheck, CheckResult } from "../shared/types.ts";
import { describeCheck, testPaths } from "../shared/acceptance.ts";

/** What the edits-only agent reports after one call. In a fix round `step` names the commit (0-based, oldest first) the edits belong to. */
export interface EditsOnlyAgentReply { summary: string; planChange: string | null; planInvalid: string | null; step: number | null }
export interface EditsOnlyOptions {
  /** Ordered commits from the approved plan with the checks of each. */
  plan: { message: string; checks: AcceptanceCheck[] }[];
  /** The base commit for the planned stack. */
  baseSha: string;
  /** Whether this is a bug fix: in a stack, the step that adds a new test is expected to fail its test run. */
  bugfix: boolean;
  /** Number of retries after the initial attempt for each step. */
  maxRetries: number;
  /** The profile's build command, run before the tests; absent when the profile has none. */
  buildCommand?: string;
  /** The profile's command that runs the tests at `paths`. */
  testCommand(paths: string[]): string;
  /** Called after each attempt that judged checks with the verdicts so far (one per check; the latest attempt wins). */
  onResults(results: CheckResult[]): void;
  /** Runs a check and captures its output. */
  runCheck(command: string): Promise<{ id: Id; exitCode: number; output: string }>;
  /** Runs one agent call with the target step and prior problems. */
  agent(request: { step: number | null; problems: string[] }): Promise<EditsOnlyAgentReply>;
  /** Git operations used to commit each verified edit. */
  git: {
    changedPaths(): Promise<string[]>;
    commitAll(message: string): Promise<string>;
    fixup(target: string, base: string): Promise<string>;
    commits(): Promise<{ sha: string; subject: string }[]>;
  };
}

const tail = (output: string) => output.split("\n").slice(-40).join("\n").slice(-4000);
const NOT_RUN = { ok: false, message: "not run in edits-only mode", runs: [] as Id[] };

/** Edits-only mode: the agent only edits; the runtime builds, runs the step's test checks and commits. A fix round checks the whole plan. `measure` checks are not run. */
export async function runEditsOnly(o: EditsOnlyOptions): Promise<{ summary: string; planChange: string | null; planInvalid: string | null }> {
  const existing = await o.git.commits();
  const fixRound = existing.length > 0;
  let last: EditsOnlyAgentReply = { summary: "", planChange: null, planInvalid: null, step: null };
  const steps: (number | null)[] = fixRound ? [null] : o.plan.map((_, index) => index);
  const verdicts = new Map<string, CheckResult>();
  for (const step of steps) {
    const label = step === null ? "fix round" : String(step + 1);
    const count = fixRound ? existing.length : o.plan.length;
    const checkPaths = [...new Set(step === null ? o.plan.flatMap((planned) => testPaths(planned.checks)) : testPaths(o.plan[step]!.checks))];
    const expectFail = step !== null && o.bugfix && o.plan.length > 1 && o.plan[step]!.checks.some((check) => check.kind === "new-test");
    const judge = (outcome: (check: AcceptanceCheck) => { ok: boolean; message: string; runs: Id[] }) => {
      for (const index of step === null ? o.plan.keys() : [step]) {
        o.plan[index]!.checks.forEach((check, checkIndex) => verdicts.set(`${index}-${checkIndex}`, { step: index, check: checkIndex, label: describeCheck(check), ...outcome(check) }));
      }
      o.onResults([...verdicts.values()].sort((a, b) => a.step - b.step || a.check - b.check));
    };
    let problems: string[] = [];
    let committed = false;
    for (let attempt = 0; attempt <= o.maxRetries && !committed; attempt++) {
      last = await o.agent({ step, problems });
      if (last.planInvalid) return { summary: last.summary, planChange: null, planInvalid: last.planInvalid };
      const target = step ?? last.step;
      if (target === null || !Number.isInteger(target) || target < 0 || target >= count) { problems = [`Name the commit the edits belong to (0 to ${count - 1})`]; continue; }
      const changed = await o.git.changedPaths();
      if (changed.length === 0) { problems = ["You made no file changes"]; continue; }
      if (o.buildCommand) {
        const build = await o.runCheck(o.buildCommand);
        if (build.exitCode !== 0) {
          judge((check) => check.kind === "measure" ? NOT_RUN : { ok: false, message: "The build failed", runs: [build.id] });
          problems = [`The build failed:\n${tail(build.output)}`];
          continue;
        }
      }
      const tests = checkPaths.length > 0 ? await o.runCheck(o.testCommand(checkPaths)) : null;
      const failed = tests !== null && tests.exitCode !== 0;
      judge((check) => check.kind === "measure" || tests === null ? NOT_RUN : { ok: failed === expectFail, message: expectFail ? (failed ? "failed before the fix, as expected" : "passed; it must fail before the fix") : failed ? "failed" : "passed", runs: [tests.id] });
      if (tests !== null && failed !== expectFail) {
        problems = [expectFail ? "The new test must fail before the fix; the check passed" : `The tests failed:\n${tail(tests.output)}`];
        continue;
      }
      if (fixRound) await o.git.fixup(existing[target]!.sha, o.baseSha);
      else await o.git.commitAll(o.plan[target]!.message);
      committed = true;
    }
    if (!committed) throw new Error(`Step ${label} still fails after ${o.maxRetries} retries: ${problems.join("; ")}`);
  }
  return { summary: last.summary, planChange: last.planChange, planInvalid: null };
}
