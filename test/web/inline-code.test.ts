import { test } from "node:test";
import assert from "node:assert/strict";
import { findInHunks, splitInlineCode } from "../../src/web/inline-code.ts";
import { searchUrl } from "../../src/web/searchfox-url.ts";
import type { DiffFile, Hunk } from "../../src/shared/types.ts";

test("splitInlineCode", () => {
  assert.deepEqual(splitInlineCode("Calls `Foo::Bar()` then `x`."), [
    { code: false, text: "Calls " }, { code: true, text: "Foo::Bar()" }, { code: false, text: " then " }, { code: true, text: "x" }, { code: false, text: "." },
  ]);
  assert.deepEqual(splitInlineCode("no code"), [{ code: false, text: "no code" }]);
  assert.deepEqual(splitInlineCode("odd ` tick"), [{ code: false, text: "odd ` tick" }]);
  assert.deepEqual(splitInlineCode("``"), [{ code: false, text: "``" }]);
});

test("searchUrl", () => {
  assert.equal(searchUrl({ repoBase: "https://searchfox.org/firefox-main/", rev: "x", exact: true }, "Foo::Bar()"), "https://searchfox.org/firefox-main/search?q=Foo%3A%3ABar");
});

const hunk = (id: string, lines: Hunk["lines"]): Hunk => ({ id, header: "", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines });
const file = (path: string): DiffFile => ({ path, status: "modified", binary: false, hunks: [] });

test("findInHunks prefers changed lines, falls back to the last name segment", () => {
  const hs = [
    { file: file("a.cpp"), hunk: hunk("f0h0", [{ kind: "ctx", text: "void FragmentDirective::SetTextDirectives(int)" }]) },
    { file: file("b.cpp"), hunk: hunk("f1h0", [{ kind: "add", text: "  SetTextDirectives(aDirectives);" }]) },
  ];
  assert.deepEqual(findInHunks("FragmentDirective::SetTextDirectives()", hs), { path: "a.cpp", hunkId: "f0h0", text: "void FragmentDirective::SetTextDirectives(int)", side: "new", line: 1 });
  assert.deepEqual(findInHunks("SetTextDirectives", hs), { path: "b.cpp", hunkId: "f1h0", text: "  SetTextDirectives(aDirectives);", side: "new", line: 1 });
  assert.equal(findInHunks("Nope", hs), null);
  assert.equal(findInHunks("ab", hs), null);
});

test("findInHunks reports the matched row: new-side line for context and additions, old-side line for deletions", () => {
  const hs = [{ file: file("a.cpp"), hunk: { ...hunk("f0h0", [{ kind: "ctx", text: "a" }, { kind: "del", text: "oldName();" }, { kind: "add", text: "newName();" }, { kind: "ctx", text: "keepName();" }]), oldStart: 10, newStart: 20 } }];
  assert.deepEqual(findInHunks("oldName", hs), { path: "a.cpp", hunkId: "f0h0", text: "oldName();", side: "old", line: 11 });
  assert.deepEqual(findInHunks("newName", hs), { path: "a.cpp", hunkId: "f0h0", text: "newName();", side: "new", line: 21 });
  assert.deepEqual(findInHunks("keepName", hs), { path: "a.cpp", hunkId: "f0h0", text: "keepName();", side: "new", line: 22 });
});
