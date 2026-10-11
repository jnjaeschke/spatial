import { test } from "node:test";
import assert from "node:assert/strict";
import { readViewState, saveViewState } from "../../src/web/view-state.ts";

const storage = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => void storage.set(key, value) } });

test("a saved view reads back with its place", () => {
  saveViewState("a", { x: 1, y: 2, zoom: 0.5, place: "change:N#c1", guideStep: 3 });
  assert.deepEqual(readViewState("a"), { x: 1, y: 2, zoom: 0.5, place: "change:N#c1", guideStep: 3 });
  saveViewState("b", { x: 0, y: 0, zoom: 1, place: null, guideStep: null });
  assert.equal(readViewState("b")!.place, null);
});

test("a view stored with a zoom level instead of a place is ignored", () => {
  storage.set("spatial:view:old", JSON.stringify({ x: 1, y: 2, zoom: 1, level: "code", guideStep: null }));
  assert.equal(readViewState("old"), null);
  storage.set("spatial:view:bad", JSON.stringify({ x: 1, y: 2, zoom: 1, place: 4, guideStep: null }));
  assert.equal(readViewState("bad"), null);
});
