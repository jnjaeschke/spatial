import { test } from "node:test";
import assert from "node:assert/strict";
import { feedbackSections } from "../../../src/plugins/implement/runtime/feedback.ts";

test("feedback sections appear only when they have content, in a fixed order", () => {
  assert.deepEqual(feedbackSections({ text: null, notes: [], threads: [], findings: [] }), []);
  assert.deepEqual(feedbackSections({ text: "do X", notes: ["n1", "n2"], threads: ["# Chat 1"], findings: ["- f"] }), [
    "# Revision request", "do X", "# Findings to fix", "- f", "# Notes from the user", "- n1\n- n2", "# Chat threads", "# Chat 1",
  ]);
});
