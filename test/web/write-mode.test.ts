import { test } from "node:test";
import assert from "node:assert/strict";
import { WRITE_MODES, readWriteMode, saveWriteMode } from "../../src/web/write-mode.ts";

const storage = () => { const map = new Map<string, string>(); return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) }; };

test("write mode defaults to auto and is remembered per repository", () => {
  const s = storage();
  assert.equal(readWriteMode(s, "/repo/.git"), "auto");
  saveWriteMode(s, "/repo/.git", "editsOnly");
  assert.equal(readWriteMode(s, "/repo/.git"), "editsOnly");
  assert.equal(readWriteMode(s, "/other/.git"), "auto");
});

test("an unknown stored value falls back to auto", () => {
  const s = storage();
  s.setItem("spatial:write-mode:/repo/.git", "bogus");
  assert.equal(readWriteMode(s, "/repo/.git"), "auto");
  assert.deepEqual(WRITE_MODES.map((mode) => mode.id), ["auto", "full", "editsOnly"]);
});
