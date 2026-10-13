import { parseUnifiedDiff } from "../../../plugin-api.ts";

/** Paths a `git diff` touches, in diff order, each once. */
export function changedFiles(diff: string): string[] {
  return [...new Set(parseUnifiedDiff(diff).map((file) => file.path))];
}
