import { defineTask, makeGitWriter, type Id, type WriteMode } from "../../../../plugin-api.ts";
import { chooseProfile } from "../../profiles.ts";
import { freeBranchName } from "../../branch.ts";
import type { ImplementBranchData } from "../../shared/types.ts";
import { nearestFork } from "../../../review/api.ts";

export const implementStart = defineTask<{ request: string; profile: string | null; checkout: "new-branch" | "current-branch"; writeMode?: WriteMode }, { branchId: Id }>({
  kind: "implementStart",
  async run(ctx, { request, profile: requested, checkout, writeMode }) {
    const profile = await chooseProfile(ctx.repoProfiles, ctx.repo, requested);
    if (writeMode === "editsOnly" && !profile.testCommand) throw new Error(`Edits-only mode needs a test command and the ${profile.id} profile has none`);
    const writer = makeGitWriter(ctx.repo);
    if (checkout === "new-branch") {
      ctx.progress({ kind: "indeterminate", message: "resolving the base branch" });
      const base = await writer.defaultBase();
      const branch = await freeBranchName(request, (name) => writer.branchExists(name));
      await writer.createBranch(branch, base.sha);
      return { branchId: ctx.artifacts.put<ImplementBranchData>("ImplementBranch", "verified", { branch, baseSha: base.sha, baseRef: base.ref, profile: profile.id, checkout }).id };
    }
    const branch = await writer.currentBranch();
    if (!branch) throw new Error("HEAD is detached; switch to a branch or start on a new branch");
    const baseSha = await nearestFork(ctx.git);
    if (!baseSha) throw new Error("Found no main or master branch to fork from");
    return { branchId: ctx.artifacts.put<ImplementBranchData>("ImplementBranch", "verified", { branch, baseSha, baseRef: null, profile: profile.id, checkout }).id };
  },
});
