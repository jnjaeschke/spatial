import type { RepoProfile } from "../../plugin-api.ts";

/** Throws when edits-only mode is asked of a profile that has no test command to run. */
export function requireEditsOnlyReady(profile: RepoProfile, writeMode: string | undefined): void {
  if (writeMode === "editsOnly" && !profile.testCommand) throw new Error(`Edits-only mode needs a test command and the ${profile.id} profile has none`);
}
