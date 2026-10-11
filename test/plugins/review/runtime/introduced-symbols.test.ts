import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiffData } from "../../../../src/plugin-api.ts";
import { addedIdentifiers, definitionSites } from "../../../../src/plugins/review/runtime/introduced-symbols.ts";

const diff: DiffData = {
  baseSha: "B", headSha: "H", commits: [{ sha: "1", subject: "one", body: "" }],
  files: [{ path: "Foo.cpp", status: "modified", binary: false, hunks: [{ id: "h0", header: "", oldStart: 1, oldLines: 0, newStart: 1, newLines: 0, lines: [] }] }],
};

function withLines(files: DiffData["files"], commits: DiffData["commits"] = diff.commits): DiffData {
  return { ...diff, commits, files };
}
function file(path: string, id: string, lines: { kind: "add" | "del" | "ctx"; text: string; commit?: number }[]) {
  return { path, status: "modified" as const, binary: false, hunks: [{ id, header: "", oldStart: 1, oldLines: 0, newStart: 1, newLines: lines.filter((line) => line.kind !== "del").length, lines }] };
}

test("addedIdentifiers skips deleted and context rows, short names, and duplicates", () => {
  const d = withLines([file("a.cpp", "h0", [
    { kind: "del", text: "RemovedName" }, { kind: "ctx", text: "ContextName" },
    { kind: "add", text: "AddedName AddedName x ab _ok" },
  ])]);
  assert.deepEqual(addedIdentifiers(d), ["AddedName", "_ok"]);
});

test("definitionSites returns header declarations and cpp definitions in diff order", () => {
  const d = withLines([
    file("Foo.cpp", "cpp", [{ kind: "add", text: "void Foo::MaybeFireChange() {" }]),
    file("Foo.h", "header", [{ kind: "add", text: "  void MaybeFireChange();" }]),
  ]);
  assert.deepEqual(definitionSites(d, "MaybeFireChange"), [
    { path: "Foo.cpp", hunkId: "cpp", line: 1, commit: 0, kind: "definition" },
    { path: "Foo.h", hunkId: "header", line: 1, commit: 0, kind: "declaration" },
  ]);
  assert.deepEqual(definitionSites(withLines([file("a.cpp", "h", [{ kind: "add", text: "  MaybeFireChange();" }])]), "MaybeFireChange"), []);
  assert.deepEqual(definitionSites(withLines([file("a.cpp", "h", [{ kind: "add", text: "  return MaybeFireChange();" }])]), "MaybeFireChange"), []);
});

test("definitionSites recognizes declarations, macros, Rust functions, and line commits", () => {
  const two = withLines([
    file("a.cpp", "h0", [{ kind: "add", text: "  bool mHasFired = false;", commit: 1 }]),
    file("b.h", "h1", [{ kind: "add", text: "#define MOZ_THING 1" }]),
    file("c.rs", "h2", [{ kind: "add", text: "pub fn new_thing() {" }]),
  ], [{ sha: "1", subject: "one", body: "" }, { sha: "2", subject: "two", body: "" }]);
  assert.deepEqual(definitionSites(two, "mHasFired"), [{ path: "a.cpp", hunkId: "h0", line: 1, commit: 1, kind: "definition" }]);
  assert.deepEqual(definitionSites(two, "MOZ_THING"), [{ path: "b.h", hunkId: "h1", line: 1, commit: 0, kind: "definition" }]);
  assert.deepEqual(definitionSites(two, "new_thing"), [{ path: "c.rs", hunkId: "h2", line: 1, commit: 0, kind: "definition" }]);
  assert.deepEqual(definitionSites(withLines([file("a.cpp", "h", [{ kind: "add", text: "  DoThing(x);" }])]), "Thing"), []);
});

test("definitionSites classifies a following brace and initialized const as definitions", () => {
  const d = withLines([file("a.cpp", "h", [
    { kind: "add", text: "void Foo()" }, { kind: "add", text: "{" },
    { kind: "add", text: "const int kX = 3;" },
  ])]);
  assert.deepEqual(definitionSites(d, "Foo"), [{ path: "a.cpp", hunkId: "h", line: 1, commit: 0, kind: "definition" }]);
  assert.deepEqual(definitionSites(d, "kX"), [{ path: "a.cpp", hunkId: "h", line: 3, commit: 0, kind: "definition" }]);
  assert.deepEqual(definitionSites(withLines([file("a.h", "decl", [{ kind: "add", text: "void Foo(int value = 0);" }])]), "Foo"), [{ path: "a.h", hunkId: "decl", line: 1, commit: 0, kind: "declaration" }]);
});

test("definitionSites: a line ending in `;` is a declaration even when the next added line opens a body", () => {
  const d = withLines([file("Foo.h", "h", [{ kind: "add", text: "  void Foo();" }, { kind: "add", text: "  void Bar() {" }, { kind: "add", text: "  void Baz()" }, { kind: "add", text: "  {" }])]);
  assert.deepEqual(definitionSites(d, "Foo").map((site) => site.kind), ["declaration"]);
  assert.deepEqual(definitionSites(d, "Baz").map((site) => site.kind), ["definition"]);
});
