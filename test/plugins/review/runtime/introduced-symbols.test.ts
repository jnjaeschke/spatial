import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiffData } from "../../../../src/plugin-api.ts";
import { addedIdentifiers, definitionSite } from "../../../../src/plugins/review/runtime/introduced-symbols.ts";

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

test("definitionSite prefers header declarations and rejects calls and returns", () => {
  const d = withLines([
    file("Foo.cpp", "cpp", [{ kind: "add", text: "void Foo::MaybeFireChange() {" }]),
    file("Foo.h", "header", [{ kind: "add", text: "  void MaybeFireChange();" }]),
  ]);
  assert.deepEqual(definitionSite(d, "MaybeFireChange"), { path: "Foo.h", hunkId: "header", line: 1, commit: 0 });
  assert.equal(definitionSite(withLines([file("a.cpp", "h", [{ kind: "add", text: "  MaybeFireChange();" }])]), "MaybeFireChange"), null);
  assert.equal(definitionSite(withLines([file("a.cpp", "h", [{ kind: "add", text: "  return MaybeFireChange();" }])]), "MaybeFireChange"), null);
});

test("definitionSite recognizes declarations, macros, Rust functions, and line commits", () => {
  const two = withLines([
    file("a.cpp", "h0", [{ kind: "add", text: "  bool mHasFired = false;", commit: 1 }]),
    file("b.h", "h1", [{ kind: "add", text: "#define MOZ_THING 1" }]),
    file("c.rs", "h2", [{ kind: "add", text: "pub fn new_thing() {" }]),
  ], [{ sha: "1", subject: "one", body: "" }, { sha: "2", subject: "two", body: "" }]);
  assert.deepEqual(definitionSite(two, "mHasFired"), { path: "a.cpp", hunkId: "h0", line: 1, commit: 1 });
  assert.deepEqual(definitionSite(two, "MOZ_THING"), { path: "b.h", hunkId: "h1", line: 1, commit: 0 });
  assert.deepEqual(definitionSite(two, "new_thing"), { path: "c.rs", hunkId: "h2", line: 1, commit: 0 });
  assert.equal(definitionSite(withLines([file("a.cpp", "h", [{ kind: "add", text: "  DoThing(x);" }])]), "Thing"), null);
});
