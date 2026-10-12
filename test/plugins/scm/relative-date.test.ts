import { test } from "node:test";
import assert from "node:assert/strict";
import { relativeDate } from "../../../src/plugins/scm/shared/relative-date.ts";

const now = Date.parse("2026-10-12T12:00:00Z");

test("relativeDate names the largest whole unit", () => {
  assert.equal(relativeDate("2026-10-12T11:59:40Z", now), "just now");
  assert.equal(relativeDate("2026-10-12T11:55:00Z", now), "5 minutes ago");
  assert.equal(relativeDate("2026-10-12T09:00:00Z", now), "3 hours ago");
  assert.equal(relativeDate("2026-10-11T12:00:00Z", now), "yesterday");
  assert.equal(relativeDate("2026-10-01T12:00:00Z", now), "last week");
  assert.equal(relativeDate("2026-06-01T12:00:00Z", now), "4 months ago");
  assert.equal(relativeDate("2024-10-01T12:00:00Z", now), "2 years ago");
});
