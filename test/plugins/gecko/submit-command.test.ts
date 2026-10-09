import { test } from "node:test";
import assert from "node:assert/strict";
import { REVIEWERS_PATTERN, parseReviewerJson, reviewerArgs, submitArgs } from "../../../src/plugins/gecko/runtime/submit-command.ts";

test("parseReviewerJson prefills module and Herald reviewers and lists recent ones as candidates", () => {
  const out = ` 0:00.40 Fetching herald rules\n${JSON.stringify({ files: ["dom/base/Element.cpp"], mots_groups: [{ name: "dom-core", modules: ["DOM Core"] }], herald_groups: [{ name: "dom-core", blocking: false }, { name: "layout-reviewers", blocking: true }], herald_individuals: [{ name: "smaug", blocking: false }] }, null, 2)}\n`;
  assert.deepEqual(parseReviewerJson(out), { suggested: ["#dom-core", "#layout-reviewers!", "smaug"], candidates: [] });
  const recent = JSON.stringify({ files: ["a"], recent_groups: [{ name: "media-playback-reviewers", count: 4 }], recent_individuals: [{ name: "alwu", count: 2 }] });
  assert.deepEqual(parseReviewerJson(recent), { suggested: [], candidates: [{ name: "#media-playback-reviewers", count: 4 }, { name: "alwu", count: 2 }] });
  assert.throws(() => parseReviewerJson("(herald rules unavailable)\n"), /printed no JSON: \(herald rules unavailable\)/);
});

test("reviewerArgs splits blocking reviewers and refuses anything that is not a name list", () => {
  assert.deepEqual(reviewerArgs(""), []);
  assert.deepEqual(reviewerArgs(" #dom-core, smaug ,#layout-reviewers! "), ["--reviewer", "#dom-core,smaug", "--blocker", "#layout-reviewers"]);
  assert.deepEqual(reviewerArgs("emilio!"), ["--blocker", "emilio"]);
  for (const bad of ["a; rm -rf x", "$(x)", "a b", "a,,b", "`x`"]) assert.throws(() => reviewerArgs(bad), /comma-separated list/, bad);
  const pattern = new RegExp(REVIEWERS_PATTERN);
  assert.ok(pattern.test("#dom-core,smaug!"));
  assert.ok(!pattern.test("a;b"));
});

test("submitArgs submits base..HEAD without prompting", () => {
  assert.deepEqual(submitArgs({ base: "abc", reviewers: "#dom-core", wip: false }), ["submit", "--yes", "--reviewer", "#dom-core", "abc", "HEAD"]);
  assert.deepEqual(submitArgs({ base: "abc", reviewers: "", wip: true }), ["submit", "--yes", "--wip", "abc", "HEAD"]);
});
