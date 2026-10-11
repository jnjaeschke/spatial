import { test } from "node:test";
import assert from "node:assert/strict";
import { derivedArtifacts } from "../../src/web/reply-actions.ts";

test("derivedArtifacts lists the artifacts derived from a message, in link order", () => {
  const artifact = (id: string) => ({ id, type: "X" }) as never;
  const link = (from: string, to: string, kind: string) => ({ id: `${from}-${to}`, sessionId: "s", from, to, kind }) as never;
  const view = { artifacts: [artifact("A"), artifact("B"), artifact("C")], links: [link("B", "M", "derivedFrom"), link("A", "M", "derivedFrom"), link("C", "M", "about"), link("A", "N", "derivedFrom"), link("GONE", "M", "derivedFrom")] };
  assert.deepEqual(derivedArtifacts(view, "M").map((a) => a.id), ["B", "A"]);
});
