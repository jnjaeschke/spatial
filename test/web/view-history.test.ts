import assert from "node:assert/strict";
import test from "node:test";
import { parseHistoryView, recentEntries, type HistoryView } from "../../src/web/view-history.ts";

const view = (place: string | null, label = place ?? "", focusedRow: HistoryView["focusedRow"] = null): HistoryView => ({ x: 1, y: 2, zoom: 1, place, guideStep: null, focusedRow, label });
const entry = (key: string, path: string, state: unknown) => ({ key, url: `http://localhost${path}`, state });

test("an entry state with the right shape parses and anything else is ignored", () => {
  const ok = view("change:c1", "Edit a", { anchor: "d#h", side: "new", line: 3 });
  assert.deepEqual(parseHistoryView(ok), ok);
  assert.equal(parseHistoryView(undefined), null);
  assert.equal(parseHistoryView({ ...ok, zoom: "1" }), null);
  assert.equal(parseHistoryView({ ...ok, label: 4 }), null);
  assert.equal(parseHistoryView({ ...ok, focusedRow: { anchor: "d#h", side: "left", line: 3 } }), null);
  assert.equal(parseHistoryView({ ...ok, focusedRow: { anchor: "d#h", side: "new" } }), null);
});

test("recent entries keep this session's labelled entries, newest first, one per URL and label", () => {
  const entries = [
    entry("0", "/sessions/s1/change/c1", view("change:c1", "Edit a")),
    entry("1", "/sessions/s2/change/c1", view("change:c1", "Edit a")),
    entry("2", "/sessions/s1/patch/0", view("patch:0", "Patch")),
    entry("3", "/sessions/s1/patch/0", undefined),
    entry("4", "/sessions/s1/change/c1", view("change:c1", "Edit a")),
    entry("5", "/sessions/s1/patch/0", view("patch:0", "Patch")),
    entry("6", "/sessions/s1/change/c2", view("change:c2", "Edit b")),
  ];
  assert.deepEqual(recentEntries(entries, 5, "s1").map((e) => e.key), ["6", "5", "4"]);
});

test("recent entries cap at 15", () => {
  const entries = Array.from({ length: 30 }, (_, i) => entry(String(i), `/sessions/s1/change/c${i}`, view(`change:c${i}`, `Change ${i}`)));
  const recent = recentEntries(entries, 10, "s1");
  assert.equal(recent.length, 15);
  assert.equal(recent[0]!.key, "29");
});
