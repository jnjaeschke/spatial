import assert from "node:assert/strict";
import test from "node:test";
import { parseNewestDiff, parseRevisions, readOnly, StackShapeError, stackOrder, fetchStack, fetchRevisionHistory, type Conduit } from "../../../../src/plugins/review/runtime/phab-revision.ts";

function rev(id: number, parents: number[] = [], closed = false) {
  const phid = `PHID-DREV-${id}`;
  return { id, phid, fields: { title: `T${id}`, status: { value: closed ? "published" : "needs-review", closed }, stackGraph: { [phid]: parents.map((p) => `PHID-DREV-${p}`) } } };
}

test("parseRevisions validates and maps search fields", () => {
  const parsed = parseRevisions({ data: [rev(1)] });
  assert.deepEqual(parsed, [{ id: 1, phid: "PHID-DREV-1", title: "T1", closed: false, stackGraph: { "PHID-DREV-1": [] } }]);
  const noGraph = rev(2) as { id: number; phid: string; fields: Record<string, unknown> };
  delete noGraph.fields.stackGraph;
  assert.deepEqual(parseRevisions({ data: [noGraph] })[0]?.stackGraph, {});
  for (const bad of [null, {}, { data: {} }, { data: [{ ...rev(1), phid: undefined }] }, { data: [{ ...rev(1), fields: { ...rev(1).fields, status: { closed: "no" } } }] }, { data: [{ ...rev(1), fields: { status: { closed: false } } }] }]) {
    assert.throws(() => parseRevisions(bad), /Malformed Conduit response/);
  }
});

test("parseNewestDiff selects and validates the newest diff base and date", () => {
  const base = "a".repeat(40);
  assert.deepEqual(parseNewestDiff({ data: [{ id: 9, fields: { dateCreated: 100, refs: [{ type: "branch", name: "x" }, { type: "base", identifier: base }] } }, { id: 8, fields: {} }] }, 3), { id: 9, base, dateCreated: 100 });
  assert.equal(parseNewestDiff({ data: [{ id: 9, fields: { dateCreated: 100, refs: [{ type: "base", identifier: "a".repeat(12) }] } }] }, 3).base, "a".repeat(12));
  assert.throws(() => parseNewestDiff({ data: [] }, 3), /No diffs found on D3/);
  assert.throws(() => parseNewestDiff({ data: [{ id: 9, fields: { dateCreated: 100, refs: [] } }] }, 3), /records no base commit/);
  assert.throws(() => parseNewestDiff({ data: [{ id: 9, fields: { dateCreated: 100, refs: [{ type: "base", identifier: "A" }] } }] }, 3), /records no base commit/);
  assert.throws(() => parseNewestDiff({ data: [{ id: 9, fields: { refs: [{ type: "base", identifier: "a".repeat(40) }] } }] }, 3), /Malformed Conduit response/);
});

test("stackOrder returns root first and stops at landed revisions", () => {
  const d1 = parseRevisions({ data: [rev(1), rev(2, [1]), rev(3, [2])] });
  d1[2]!.stackGraph = { "PHID-DREV-3": ["PHID-DREV-2"], "PHID-DREV-2": ["PHID-DREV-1"], "PHID-DREV-1": [] };
  const byPhid = new Map(d1.map((r) => [r.phid, r]));
  assert.deepEqual(stackOrder(d1[2]!, byPhid).map((r) => r.id), [1, 2, 3]);
  const closed = parseRevisions({ data: [rev(1, [], true), rev(2, [1]), rev(3, [2])] });
  closed[2]!.stackGraph = { "PHID-DREV-3": ["PHID-DREV-2"], "PHID-DREV-2": ["PHID-DREV-1"], "PHID-DREV-1": [] };
  assert.deepEqual(stackOrder(closed[2]!, new Map(closed.map((r) => [r.phid, r]))).map((r) => r.id), [2, 3]);
  assert.deepEqual(stackOrder(d1[0]!, new Map([[d1[0]!.phid, d1[0]!]])).map((r) => r.id), [1]);
  const headClosed = parseRevisions({ data: [rev(4, [], true)] })[0]!;
  assert.deepEqual(stackOrder(headClosed, new Map([[headClosed.phid, headClosed]])).map((r) => r.id), [4]);
});

test("stackOrder rejects branching, cycles, and missing open parents", () => {
  const [head, p1, p2] = parseRevisions({ data: [rev(3, [1, 2]), rev(1), rev(2)] });
  head!.stackGraph = { "PHID-DREV-3": ["PHID-DREV-1", "PHID-DREV-2"] };
  assert.throws(() => stackOrder(head!, new Map([[head!.phid, head!], [p1!.phid, p1!], [p2!.phid, p2!]])), (e: unknown) => e instanceof StackShapeError && /several open parent revisions/.test(e.message));
  const [a, b] = parseRevisions({ data: [rev(1, [2]), rev(2, [1])] });
  a!.stackGraph = { "PHID-DREV-1": ["PHID-DREV-2"], "PHID-DREV-2": ["PHID-DREV-1"] };
  assert.throws(() => stackOrder(a!, new Map([[a!.phid, a!], [b!.phid, b!]])), (e: unknown) => e instanceof StackShapeError && /cycle/.test(e.message));
  assert.throws(() => stackOrder(head!, new Map([[head!.phid, head!]])), /was not returned by Conduit/);
});

test("fetchStack requests ancestors and diffs in root-first order", async () => {
  const revisions = [rev(3, [2]), rev(1), rev(2, [1])];
  const diffs = new Map([["PHID-DREV-1", 11], ["PHID-DREV-2", 22], ["PHID-DREV-3", 33]]);
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  revisions[0]!.fields.stackGraph = {
    "PHID-DREV-3": ["PHID-DREV-2"], "PHID-DREV-2": ["PHID-DREV-1"], "PHID-DREV-1": [],
  };
  const c = { async call(method: string, params: Record<string, unknown>) {
    calls.push({ method, params });
    if (method === "differential.revision.search") return calls.length === 1 ? { data: [revisions[0]] } : { data: revisions.slice(1) };
    if (method === "differential.diff.search") {
      const phid = (params.constraints as { revisionPHIDs: string[] }).revisionPHIDs[0]!;
      return { data: [{ id: diffs.get(phid), fields: { dateCreated: 100, refs: [{ type: "base", identifier: "a".repeat(40) }] } }] };
    }
    throw new Error(method);
  } };
  const result = await fetchStack(c as unknown as Conduit, 3);
  assert.deepEqual(result.map(({ revision, diff }) => [revision.id, diff.id]), [[1, 11], [2, 22], [3, 33]]);
  assert.deepEqual(calls.map((call) => call.method), ["differential.revision.search", "differential.revision.search", "differential.diff.search", "differential.diff.search", "differential.diff.search"]);
  assert.deepEqual(calls[0]!.params, { constraints: { ids: [3] } });
  assert.deepEqual(calls[1]!.params, { constraints: { phids: ["PHID-DREV-2", "PHID-DREV-1"] }, limit: 100 });
  assert.deepEqual(calls.slice(2).map((call) => (call.params.constraints as { revisionPHIDs: string[] }).revisionPHIDs[0]), ["PHID-DREV-1", "PHID-DREV-2", "PHID-DREV-3"]);
  const singleCalls: string[] = [];
  const one = await fetchStack({ async call(method: string) {
    singleCalls.push(method);
    return method === "differential.revision.search"
      ? { data: [rev(3)] }
      : { data: [{ id: 33, fields: { dateCreated: 100, refs: [{ type: "base", identifier: "a".repeat(40) }] } }] };
  } } as unknown as Conduit, 3);
  assert.equal(one.length, 1);
  assert.deepEqual(singleCalls, ["differential.revision.search", "differential.diff.search"]);
  await assert.rejects(fetchStack({ async call() { return { data: [] }; } } as unknown as Conduit, 3), /D3 not found/);
});

test("readOnly permits only the three read methods", async () => {
  const called: string[] = [];
  const wrapped = readOnly({ async call(method: string, params: Record<string, unknown>) { called.push(method); return { method, params }; } } as unknown as Conduit);
  for (const method of ["differential.createinline", "differential.revision.edit", "differential.creatediff", "transaction.search"]) {
    await assert.rejects(wrapped.call(method, {}), /read-only/);
  }
  for (const method of ["differential.revision.search", "differential.diff.search", "differential.getrawdiff"]) await wrapped.call(method, {});
  assert.deepEqual(called, ["differential.revision.search", "differential.diff.search", "differential.getrawdiff"]);
});

test("fetchRevisionHistory returns every diff of each revision, newest first", async () => {
  const diff = (id: number, base: string, dateCreated: number) => ({ id, fields: { dateCreated, refs: [{ type: "base", identifier: base }] } });
  const calls: [string, unknown][] = [];
  const conduit = { async call(method: string, params: Record<string, unknown>) {
    calls.push([method, params]);
    if (method === "differential.revision.search") return { data: [
      { id: 1, phid: "PHID-1", fields: { title: "Part 1", status: { closed: false } } },
      { id: 2, phid: "PHID-2", fields: { title: "Part 2", status: { closed: false } } },
    ] };
    const phid = (params.constraints as { revisionPHIDs: string[] }).revisionPHIDs[0];
    return { data: phid === "PHID-1" ? [diff(30, "a".repeat(40), 300), diff(10, "a".repeat(40), 100)] : [diff(31, "a".repeat(40), 301)] };
  } };
  const history = await fetchRevisionHistory(conduit as never, [1, 2]);
  assert.deepEqual(history.map((h) => [h.revision.title, h.diffs.map((x) => x.id)]), [["Part 1", [30, 10]], ["Part 2", [31]]]);
  assert.deepEqual(calls[1]![1], { constraints: { revisionPHIDs: ["PHID-1"] }, order: "newest", limit: 100 });
});

test("fetchRevisionHistory rejects an id Conduit did not return", async () => {
  const conduit = { async call() { return { data: [] }; } };
  await assert.rejects(fetchRevisionHistory(conduit as never, [7]), /D7 not found/);
});
