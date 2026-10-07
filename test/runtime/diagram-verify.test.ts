import { test } from "node:test";
import assert from "node:assert/strict";
import { verifySequence, type SequenceProposal } from "../../src/runtime/diagram-verify.ts";
import type { DiffData } from "../../src/shared/types.ts";

const diff: DiffData = { baseSha: "base", headSha: "c2", commits: [{ sha: "c1", subject: "one", body: "" }, { sha: "c2", subject: "two", body: "" }], files: [] };
const lane = (id: string) => ({ id, label: id, note: null });
const step = (symbol: string, line = 1, status: SequenceProposal["steps"][number]["status"] = "new") => ({ from: "a", to: "b", symbol, call: `${symbol}()`, what: "Calls it", when: null, guard: null, phase: "run", status, cite: { path: "a.ts", line } });
const proposal = (steps: SequenceProposal["steps"] = [step("alpha")], before: SequenceProposal["before"] = null, commit = 1): SequenceProposal => ({ commit, title: "test", summary: "summary", lanes: [lane("a"), lane("b")], steps, before });
function fixture(files: Record<string, string>) {
  const calls: string[] = [];
  const show = async (sha: string, path: string) => { calls.push(`${sha}:${path}`); const value = files[`${sha}:${path}`]; if (value === undefined) throw new Error("missing"); return value; };
  return { show, calls };
}

test("matches the nearest whole-token line within two lines and records its text", async () => {
  const { show } = fixture({ "c1:a.ts": "other\nalpha\nalpha();\nother\nbeta\nbeta()" });
  const result = await verifySequence(proposal([step("alpha", 4), step("beta", 4)]), diff, show);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual([result.data.steps[0]?.cite.line, result.data.steps[0]?.text], [3, "alpha();"]);
    assert.deepEqual([result.data.steps[1]?.cite.line, result.data.steps[1]?.text], [5, "beta"]);
  }
});

test("before steps are checked against the commit parent", async () => {
  const { show, calls } = fixture({ "base:a.ts": "oldFlow()", "c1:a.ts": "newFlow()" });
  const result = await verifySequence(proposal([step("newFlow")], [step("oldFlow", 1, "removed")]), diff, show);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.before?.[0]?.verified, true);
  assert.deepEqual(calls, ["c1:a.ts", "base:a.ts"]);
});

test("missing citations stay unverified and preserve their requested line", async () => {
  const result = await verifySequence(proposal([step("absent", 8), step("alpha", 2)]), diff, fixture({ "c1:a.ts": "other\nalphabet" }).show);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual([result.data.steps[0]?.verified, result.data.steps[0]?.text, result.data.steps[0]?.cite.line], [false, null, 8]);
    assert.equal(result.data.steps[1]?.verified, false);
  }
});

test("rejects bad commit, lane counts and ids, unknown lanes, empty or oversized steps, and removed current steps", async () => {
  const show = fixture({}).show;
  const base = proposal();
  const candidates: SequenceProposal[] = [
    { ...base, commit: 0 }, { ...base, commit: 3 }, { ...base, lanes: [] }, { ...base, lanes: Array.from({ length: 9 }, (_, i) => lane(String(i))) },
    { ...base, lanes: [lane("a"), lane("a")] }, { ...base, steps: [{ ...step("x"), from: "missing" }] },
    { ...base, steps: [] }, { ...base, steps: Array.from({ length: 31 }, () => step("x")) },
    { ...base, steps: [step("x", 1, "removed")] }, { ...base, before: Array.from({ length: 31 }, () => step("x", 1, "removed")) },
  ];
  for (const candidate of candidates) assert.equal((await verifySequence(candidate, diff, show)).ok, false);
});

test("reads each revision and path at most once", async () => {
  const { show, calls } = fixture({ "c1:a.ts": "alpha beta" });
  await verifySequence(proposal([step("alpha"), step("beta")]), diff, show);
  assert.deepEqual(calls, ["c1:a.ts"]);
});
