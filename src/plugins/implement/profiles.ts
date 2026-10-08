import type { RepoProfile } from "../../plugin-api.ts";

export const PLAIN_GIT = "plain-git";
/** Any git repository: one commit with a free-form message and no required checks. */
export const plainGitProfile: RepoProfile = { id: PLAIN_GIT, description: "Any git repository: one commit with a free-form message, no required checks.", commitStyle: "single" };

/** `requested` when given (it must exist); else the only profile whose `detect` matches `repo`; else plain-git. */
export async function chooseProfile(profiles: ReadonlyMap<string, RepoProfile>, repo: string, requested: string | null): Promise<RepoProfile> {
  if (requested !== null) {
    const profile = profiles.get(requested);
    if (!profile) throw new Error(`Unknown repo profile: ${requested}`);
    return profile;
  }
  const matches: RepoProfile[] = [];
  for (const profile of profiles.values()) if (await profile.detect?.(repo)) matches.push(profile);
  const chosen = matches.length === 1 ? matches[0] : profiles.get(PLAIN_GIT);
  if (!chosen) throw new Error("No plain-git repo profile is registered");
  return chosen;
}
