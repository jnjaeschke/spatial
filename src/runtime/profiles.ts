import type { WorkflowStartData } from "../shared/types.ts";
import type { RepoProfile } from "./plugins.ts";
import type { SessionView } from "./render-ref.ts";

export const PLAIN_GIT = "plain-git";
/** Any git repository: one commit with a free-form message and no required checks. */
export const plainGitProfile: RepoProfile = { id: PLAIN_GIT, description: "Any git repository: one commit with a free-form message, no required checks.", commitStyle: "single" };

/** The profile registered as `id`; throws when there is none. */
export function requireProfile(profiles: ReadonlyMap<string, RepoProfile>, id: string): RepoProfile {
  const profile = profiles.get(id);
  if (!profile) throw new Error(`Unknown repo profile: ${id}`);
  return profile;
}

/** `requested` when given (it must exist); else the only profile whose `detect` matches `repo`; else plain-git. */
export async function chooseProfile(profiles: ReadonlyMap<string, RepoProfile>, repo: string, requested: string | null): Promise<RepoProfile> {
  if (requested !== null) return requireProfile(profiles, requested);
  const matches: RepoProfile[] = [];
  for (const profile of profiles.values()) if (await profile.detect?.(repo)) matches.push(profile);
  const chosen = matches.length === 1 ? matches[0] : profiles.get(PLAIN_GIT);
  if (!chosen) throw new Error("No plain-git repo profile is registered");
  return chosen;
}

/** The profile named by the session's latest `WorkflowStart`; null when the session has none. */
export function startProfile(profiles: ReadonlyMap<string, RepoProfile>, view: SessionView): RepoProfile | null {
  const id = (view.artifacts.findLast((artifact) => artifact.type === "WorkflowStart")?.data as WorkflowStartData | undefined)?.profile;
  return id === undefined ? null : requireProfile(profiles, id);
}

/** The session's repo profile: the one its `WorkflowStart` names, else the one detected in `worktree` (sessions created without a workflow start). */
export async function sessionProfile(profiles: ReadonlyMap<string, RepoProfile>, view: SessionView, worktree: string): Promise<RepoProfile> {
  return startProfile(profiles, view) ?? chooseProfile(profiles, worktree, null);
}
