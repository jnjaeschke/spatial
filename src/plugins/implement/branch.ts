/** Lowercase words of the request, at most six and 40 characters, joined by dashes. */
export function branchSlug(request: string): string {
  const words = request.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).slice(0, 6);
  return words.join("-").slice(0, 40).replace(/-+$/, "") || "change";
}

/** The first free `spatial/<slug>`, `spatial/<slug>-2`, `spatial/<slug>-3`, … */
export async function freeBranchName(request: string, exists: (name: string) => Promise<boolean>): Promise<string> {
  const base = `spatial/${branchSlug(request)}`;
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base}-${n}`;
    if (!(await exists(name))) return name;
  }
}

/** Throws unless the checkout is on `expected`; `current` is the checked-out branch, null on a detached HEAD. */
export function requireCheckoutOn(current: string | null, expected: string): void {
  if (current !== expected) throw new Error(`The checkout is on ${current ?? "a detached HEAD"}, not on ${expected}; spatial does not switch branches or move the checkout back`);
}
