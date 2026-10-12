import type { RepoProfile } from "../../plugin-api.ts";

export const PLAIN_GIT = "plain-git";
/** Any git repository: one commit with a free-form message and no required checks. */
export const plainGitProfile: RepoProfile = { id: PLAIN_GIT, description: "Any git repository: one commit with a free-form message, no required checks.", commitStyle: "single" };

/** The profile registered as `id`; throws when there is none. */
export function requireProfile(profiles: ReadonlyMap<string, RepoProfile>, id: string): RepoProfile {
  const profile = profiles.get(id);
  if (!profile) throw new Error(`Unknown repo profile: ${id}`);
  return profile;
}

/** Throws when edits-only mode is asked of a profile that has no test command to run. */
export function requireEditsOnlyReady(profile: RepoProfile, writeMode: string | undefined): void {
  if (writeMode === "editsOnly" && !profile.testCommand) throw new Error(`Edits-only mode needs a test command and the ${profile.id} profile has none`);
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
