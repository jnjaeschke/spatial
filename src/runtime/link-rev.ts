import type { SessionView } from "./render-ref.ts";

/** The revision a session's code links point at: the first plugin hook answer, or null when none is known. */
export function selectLinkRev(view: SessionView, hooks: ((view: SessionView) => string | null)[]): string | null {
  for (const hook of hooks) {
    const rev = hook(view);
    if (rev) return rev;
  }
  return null;
}
