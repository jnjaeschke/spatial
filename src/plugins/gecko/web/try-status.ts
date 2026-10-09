import type { TryRunData } from "../shared/types.ts";

/** One line about a push: waiting, the Treeherder error, or its job counts and failures. */
export function tryHeadline(run: TryRunData | null): string {
  if (!run) return "Waiting for Treeherder…";
  if (run.error) return `Treeherder: ${run.error}`;
  const c = run.counts, failing = run.failures.length;
  if (run.complete) return `Finished: ${c.completed ?? 0} done, ${failing ? `${failing} failing` : "all passed"}`;
  return `Running: ${c.completed ?? 0} done, ${c.running ?? 0} running, ${c.pending ?? 0} pending, ${failing} failing`;
}
