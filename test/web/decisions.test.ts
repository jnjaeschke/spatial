import { test } from "node:test";
import assert from "node:assert/strict";
import type { Artifact, DecisionData } from "../../src/shared/types.ts";
import { openDecision, optionProblem } from "../../src/web/decisions.ts";

const decision = (chosen: DecisionData["chosen"]): Artifact => ({ id: `d${Math.random()}`, sessionId: "s", type: "Decision", status: "proposed", data: { key: "q", question: "Q", options: [], chosen } satisfies DecisionData, provenance: { taskId: "runtime" }, epoch: 1, createdAt: "" });

test("only the latest decision can be open", () => {
  const open = decision(null);
  assert.equal(openDecision([open])?.id, open.id);
  assert.equal(openDecision([open, decision({ option: "a", by: "user" })]), null);
  assert.equal(openDecision([]), null);
  assert.equal(openDecision([{ ...open, type: "Note" }]), null);
});

test("option problems mirror the server's text checks", () => {
  assert.equal(optionProblem({ id: "a", label: "A" }, ""), null);
  assert.equal(optionProblem({ id: "a", label: "A", requiresText: true, takesText: true }, "  "), "Text required");
  assert.equal(optionProblem({ id: "a", label: "A", takesText: true, textPattern: "\\d+" }, ""), null);
  assert.equal(optionProblem({ id: "a", label: "A", takesText: true, textPattern: "\\d+" }, "x"), "Must match \\d+");
  assert.equal(optionProblem({ id: "a", label: "A", takesText: true, textPattern: "\\d+" }, "bug 12"), null);
});
