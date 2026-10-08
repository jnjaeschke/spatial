/** What the edits-only agent reports after one call. In a fix round `step` names the commit (0-based, oldest first) the edits belong to. */
export interface EditsOnlyAgentReply { summary: string; planChange: string | null; planInvalid: string | null; step: number | null }
export interface EditsOnlyOptions {
  /** Ordered commit messages from the approved plan. */
  plan: { message: string }[];
  /** The base commit for the planned stack. */
  baseSha: string;
  /** Whether this is a bug fix that needs failing-test-first checks. */
  bugfix: boolean;
  /** Number of retries after the initial attempt for each step. */
  maxRetries: number;
  /** Builds the profile check command for the changed paths. */
  checkCommand(paths: string[]): string;
  /** Runs a check and captures its output. */
  runCheck(command: string): Promise<{ exitCode: number; output: string }>;
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

/** Edits-only mode: the agent only edits; the runtime runs the profile's check command and commits. */
export async function runEditsOnly(o: EditsOnlyOptions): Promise<{ summary: string; planChange: string | null; planInvalid: string | null }> {
  const existing = await o.git.commits();
  const fixRound = existing.length > 0;
  let last: EditsOnlyAgentReply = { summary: "", planChange: null, planInvalid: null, step: null };
  const steps: (number | null)[] = fixRound ? [null] : o.plan.map((_, index) => index);
  for (const step of steps) {
    const label = step === null ? "fix round" : String(step + 1);
    const count = fixRound ? existing.length : o.plan.length;
    let problems: string[] = [];
    let committed = false;
    for (let attempt = 0; attempt <= o.maxRetries && !committed; attempt++) {
      last = await o.agent({ step, problems });
      if (last.planInvalid) return { summary: last.summary, planChange: null, planInvalid: last.planInvalid };
      const target = step ?? last.step;
      if (target === null || !Number.isInteger(target) || target < 0 || target >= count) { problems = [`Name the commit the edits belong to (0 to ${count - 1})`]; continue; }
      const paths = await o.git.changedPaths();
      if (paths.length === 0) { problems = ["You made no file changes"]; continue; }
      const check = await o.runCheck(o.checkCommand(paths));
      const expectFail = !fixRound && o.bugfix && o.plan.length > 1 && step === 0;
      if (expectFail ? check.exitCode === 0 : check.exitCode !== 0) {
        problems = [expectFail ? "The new test must fail before the fix; the check passed" : `The check failed:\n${tail(check.output)}`];
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
