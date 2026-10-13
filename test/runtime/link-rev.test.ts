import { test } from "node:test";
import assert from "node:assert/strict";
import { selectLinkRev } from "../../src/runtime/link-rev.ts";

const view = () => ({ artifacts: [], links: [] });

test("selectLinkRev returns the first plugin hook answer", () => {
  assert.equal(selectLinkRev(view(), [() => "review", () => "implement"]), "review");
});

test("selectLinkRev skips hooks that do not know a revision", () => {
  assert.equal(selectLinkRev(view(), [() => null, () => "hook", () => "later"]), "hook");
});

test("selectLinkRev is null without a hook answer", () => {
  assert.equal(selectLinkRev(view(), []), null);
  assert.equal(selectLinkRev(view(), [() => null]), null);
});
