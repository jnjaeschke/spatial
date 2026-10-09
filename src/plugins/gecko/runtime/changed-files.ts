/** Paths a `git diff` touches, in diff order, each once. */
export function changedFiles(diff: string): string[] {
  return [...new Set([...diff.matchAll(/^diff --git a\/.+ b\/(.+)$/gm)].map((m) => m[1]!))];
}
