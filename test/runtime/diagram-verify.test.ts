import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyDiagram, type DiagramProposal } from "../../src/runtime/diagram-verify.ts";
import type { DiffData, DiagramNode, DiagramEdge } from "../../src/shared/types.ts";

const diff: DiffData = { baseSha: "base", headSha: "c2", commits: [{ sha: "c1", subject: "one", body: "" }, { sha: "c2", subject: "two", body: "" }], files: [] };
const node = (id: string, identifier: string, path = "a.ts", line = 1, status: DiagramNode["status"] = "context"): Omit<DiagramNode, "verified"> => ({ id, label: id, identifier, kind: "function", status, cite: { path, line } });
const edge = (from: string, to: string, path = "a.ts", line = 1): Omit<DiagramEdge, "verified"> => ({ from, to, kind: "calls", step: null, cite: { path, line } });
const proposal = (nodes: Omit<DiagramNode, "verified">[], edges: Omit<DiagramEdge, "verified">[] = [], commit = 1): DiagramProposal => ({ commit, mode: "map", title: "test", nodes, edges });
function fixture(files: Record<string, string>) {
  const calls: string[] = [];
  const show = async (sha: string, path: string) => {
    calls.push(`${sha}:${path}`);
    const value = files[`${sha}:${path}`];
    if (value === undefined) throw new Error("missing");
    return value;
  };
  return { show, calls };
}

test("verifies node identifiers at cited lines and marks missing or out-of-range citations unverified", async () => {
  const { show } = fixture({ "c1:a.ts": "const alpha = 1;\nconst beta = 2;" });
  const result = await verifyDiagram(proposal([node("a", "alpha"), node("b", "wrong", "a.ts", 2), node("c", "alpha", "missing.ts"), node("d", "alpha", "a.ts", 0), node("e", "alpha", "a.ts", 3)]), diff, show);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.data.nodes.map((n) => n.verified), [true, false, false, false, false]);
});

test("checks removed nodes in the parent tree", async () => {
  const { show, calls } = fixture({ "c1:a.ts": "gone()", "base:a.ts": "oldName()" });
  const result = await verifyDiagram(proposal([node("a", "oldName", "a.ts", 1, "removed")], [], 1), diff, show);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.nodes[0]!.verified, true);
  assert.deepEqual(calls, ["base:a.ts"]);
});

test("verifies an edge against the target identifier, not the source", async () => {
  const { show } = fixture({ "c1:a.ts": "source(); target();" });
  const result = await verifyDiagram(proposal([node("s", "source"), node("t", "target")], [edge("s", "t")]), diff, show);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.edges[0]!.verified, true);
  const negative = await verifyDiagram(proposal([node("s", "source"), node("t", "absent")], [edge("s", "t")]), diff, show);
  assert.equal(negative.ok, true);
  if (negative.ok) assert.equal(negative.data.edges[0]!.verified, false);
});

test("matches whole identifiers including operators", async () => {
  const { show } = fixture({ "c1:a.ts": "runner(); bool operator==(x);" });
  const result = await verifyDiagram(proposal([node("a", "run"), node("b", "operator==", "a.ts", 1)]), diff, show);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.data.nodes.map((n) => n.verified), [false, true]);
});

test("rejects invalid endpoints, duplicate ids, invalid commit, and oversized proposals", async () => {
  const { show } = fixture({});
  for (const candidate of [
    proposal([node("a", "a")], [edge("a", "unknown")]),
    proposal([node("a", "a"), node("a", "b")]),
    proposal([node("a", "a")], [], 3),
    proposal(Array.from({ length: 41 }, (_, i) => node(String(i), "x"))),
  ]) assert.equal((await verifyDiagram(candidate, diff, show)).ok, false);
});

test("reads each commit and path at most once", async () => {
  const { show, calls } = fixture({ "c1:a.ts": "alpha beta" });
  await verifyDiagram(proposal([node("a", "alpha"), node("b", "beta")], [edge("a", "b")]), diff, show);
  assert.deepEqual(calls, ["c1:a.ts"]);
});
