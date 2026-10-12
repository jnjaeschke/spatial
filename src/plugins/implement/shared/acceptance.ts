import type { AcceptanceCheck } from "./types.ts";

export const WPT_TESTS_PREFIX = "testing/web-platform/tests/";
export const isWptTest = (path: string): boolean => path.startsWith(WPT_TESTS_PREFIX);

/** The test paths of the checks that name one (every kind but `measure`). */
export const testPaths = (checks: AcceptanceCheck[]): string[] => checks.flatMap((check) => check.kind === "measure" ? [] : [check.path]);

/** One line naming a check, for prompts, problem lists and the UI. */
export function describeCheck(check: AcceptanceCheck): string {
  switch (check.kind) {
    case "measure": return `measure \`${check.command}\` - ${check.goal}`;
    case "failing-test": return `failing-test ${check.path}${check.subtests.length ? ` (${check.subtests.join("; ")})` : ""}${check.baseEvidence ? ` [${check.baseEvidence}]` : ""}`;
    default: return `${check.kind} ${check.path}`;
  }
}
