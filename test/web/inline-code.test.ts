import { test } from "node:test";
import assert from "node:assert/strict";
import { findInHunks, searchfoxSearchUrl, splitInlineCode } from "../../src/web/inline-code.ts";
import type { DiffFile, Hunk } from "../../src/shared/types.ts";

test("splitInlineCode", () => {
  assert.deepEqual(splitInlineCode("Calls `Foo::Bar()` then `x`."), [
    { code: false, text: "Calls " }, { code: true, text: "Foo::Bar()" }, { code: false, text: " then " }, { code: true, text: "x" }, { code: false, text: "." },
  ]);
  assert.deepEqual(splitInlineCode("no code"), [{ code: false, text: "no code" }]);
  assert.deepEqual(splitInlineCode("odd ` tick"), [{ code: false, text: "odd ` tick" }]);
  assert.deepEqual(splitInlineCode("``"), [{ code: false, text: "``" }]);
});

test("searchfoxSearchUrl", () => {
  assert.equal(searchfoxSearchUrl("https://searchfox.org/firefox-main/source/", "Foo::Bar()"), "https://searchfox.org/firefox-main/search?q=Foo%3A%3ABar");
});

const hunk = (id: string, lines: Hunk["lines"]): Hunk => ({ id, header: "", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines });
const file = (path: string): DiffFile => ({ path, status: "modified", binary: false, hunks: [] });

test("findInHunks prefers changed lines, falls back to the last name segment", () => {
  const hs = [
    { file: file("a.cpp"), hunk: hunk("f0h0", [{ kind: "ctx", text: "void FragmentDirective::SetTextDirectives(int)" }]) },
    { file: file("b.cpp"), hunk: hunk("f1h0", [{ kind: "add", text: "  SetTextDirectives(aDirectives);" }]) },
  ];
  assert.deepEqual(findInHunks("FragmentDirective::SetTextDirectives()", hs), { path: "a.cpp", hunkId: "f0h0", text: "void FragmentDirective::SetTextDirectives(int)" });
  assert.deepEqual(findInHunks("SetTextDirectives", hs), { path: "b.cpp", hunkId: "f1h0", text: "  SetTextDirectives(aDirectives);" });
  assert.equal(findInHunks("Nope", hs), null);
  assert.equal(findInHunks("ab", hs), null);
});
