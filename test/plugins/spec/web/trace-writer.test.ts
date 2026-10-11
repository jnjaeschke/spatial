import { test } from "node:test";
import assert from "node:assert/strict";
import { TraceWriter } from "../../../../src/plugins/spec/web/trace-writer.ts";
import type { SpecTraceData } from "../../../../src/plugins/spec/shared/types.ts";

const entry = (step: string) => ({ anchor: "HTML#a", step, note: "" });
const artifact = (id: string, data: SpecTraceData) => ({ id, type: "SpecTrace", data }) as never;
function setup() {
  const saves: { id: string; trace: SpecTraceData }[] = [];
  const writer = new TraceWriter(async (trace) => { await new Promise((resolve) => setTimeout(resolve, 1)); const id = `a${saves.length + 1}`; saves.push({ id, trace }); return id; });
  return { writer, saves };
}

test("concurrent edits compose against the last saved version", async () => {
  const { writer, saves } = setup();
  const base: SpecTraceData = { traceId: "t", title: "T", entries: [] };
  writer.observe([artifact("a0", base)]);
  const add = (step: string) => writer.editTrace("t", (trace) => ({ ...trace, entries: [...trace.entries, entry(step)] }));
  await Promise.all([add("1"), add("2"), writer.editTrace("t", (trace) => ({ ...trace, title: "Renamed" }))]);
  assert.deepEqual(saves.at(-1)!.trace, { traceId: "t", title: "Renamed", entries: [entry("1"), entry("2")] });
});

test("two adds without a trace create one trace", async () => {
  const { writer, saves } = setup();
  let active: string | null = null;
  const add = (step: string) => writer.edit((known) => {
    const current = known.find((trace) => trace.traceId === active);
    return current ? { ...current, entries: [...current.entries, entry(step)] } : { traceId: `new${known.length}`, title: "Trace", entries: [entry(step)] };
  }, (trace) => { active = trace.traceId; });
  await Promise.all([add("1"), add("2")]);
  assert.equal(new Set(saves.map((s) => s.trace.traceId)).size, 1);
  assert.deepEqual(saves.at(-1)!.trace.entries, [entry("1"), entry("2")]);
});

test("a newer artifact wins over the last saved version, an older one does not", async () => {
  const { writer } = setup();
  const v0: SpecTraceData = { traceId: "t", title: "v0", entries: [] };
  writer.observe([artifact("a0", v0)]);
  await writer.editTrace("t", (trace) => ({ ...trace, title: "mine" }));
  assert.equal(writer.known()[0]!.title, "mine");
  writer.observe([artifact("a0", v0)]);
  assert.equal(writer.known()[0]!.title, "mine");
  writer.observe([artifact("a0", v0), artifact("a1", { ...v0, title: "mine" }), artifact("a9", { ...v0, title: "other client" })]);
  assert.equal(writer.known()[0]!.title, "other client");
});

test("a failed edit rejects without blocking later edits", async () => {
  const { writer, saves } = setup();
  writer.observe([artifact("a0", { traceId: "t", title: "T", entries: [] })]);
  const failed = writer.editTrace("gone", (trace) => trace);
  const ok = writer.editTrace("t", (trace) => ({ ...trace, title: "ok" }));
  await assert.rejects(failed, /Unknown trace gone/);
  await ok;
  assert.equal(saves.length, 1);
});
