import { test } from "node:test";
import assert from "node:assert/strict";
import type { RepoProfile } from "../../src/plugin-api.ts";
import type { Artifact } from "../../src/shared/types.ts";
import { PLAIN_GIT, chooseProfile, plainGitProfile, sessionProfile, startProfile } from "../../src/runtime/profiles.ts";

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

test("plain-git takes one commit and has no build or test command", () => {
  assert.equal(plainGitProfile.commitStyle, "single");
  assert.equal(plainGitProfile.buildCommand, undefined);
  assert.equal(plainGitProfile.testCommand, undefined);
  assert.equal(plainGitProfile.afterAccept, undefined);
});

const viewWith = (data?: object) => ({ links: [], artifacts: data ? [{ type: "WorkflowStart", data } as Artifact] : [] });

test("startProfile is the profile the latest WorkflowStart names; null without one", () => {
  const profiles = map(plainGitProfile, profile("gecko", true));
  assert.equal(startProfile(profiles, viewWith({ profile: "gecko" }))?.id, "gecko");
  assert.equal(startProfile(profiles, viewWith()), null);
  assert.throws(() => startProfile(profiles, viewWith({ profile: "nope" })), /Unknown repo profile: nope/);
});

test("sessionProfile falls back to detection without a WorkflowStart", async () => {
  const profiles = map(plainGitProfile, profile("gecko", true));
  assert.equal((await sessionProfile(profiles, viewWith({ profile: PLAIN_GIT }), "/r")).id, PLAIN_GIT);
  assert.equal((await sessionProfile(profiles, viewWith(), "/r")).id, "gecko");
});
