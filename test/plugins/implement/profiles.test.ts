import { test } from "node:test";
import assert from "node:assert/strict";
import type { RepoProfile } from "../../../src/plugin-api.ts";
import { PLAIN_GIT, chooseProfile, plainGitProfile } from "../../../src/plugins/implement/profiles.ts";

const profile = (id: string, detected: boolean): RepoProfile => ({ id, description: id, commitStyle: "stack", detect: async () => detected });
const map = (...profiles: RepoProfile[]) => new Map(profiles.map((p) => [p.id, p]));

test("a requested profile wins and must exist", async () => {
  const profiles = map(plainGitProfile, profile("gecko", true));
  assert.equal((await chooseProfile(profiles, "/r", "plain-git")).id, PLAIN_GIT);
  await assert.rejects(chooseProfile(profiles, "/r", "nope"), /Unknown repo profile: nope/);
});

test("without a request the single detected profile is chosen, else plain-git", async () => {
  assert.equal((await chooseProfile(map(plainGitProfile, profile("gecko", true)), "/r", null)).id, "gecko");
  assert.equal((await chooseProfile(map(plainGitProfile, profile("gecko", false)), "/r", null)).id, PLAIN_GIT);
  assert.equal((await chooseProfile(map(plainGitProfile, profile("a", true), profile("b", true)), "/r", null)).id, PLAIN_GIT);
});

test("plain-git takes one commit and has no check command", () => {
  assert.equal(plainGitProfile.commitStyle, "single");
  assert.equal(plainGitProfile.checkCommand, undefined);
  assert.equal(plainGitProfile.afterAccept, undefined);
});
