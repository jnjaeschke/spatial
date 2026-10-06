import { test } from "node:test";
import assert from "node:assert/strict";
import { changedLines, IncrementalTokenizer, lineSegments, parserFor, rowSegments, segmentsByLine, tokenize, type CodeRow, type Span } from "../../src/web/syntax.ts";

const named = (path: string, text: string) => tokenize(path, text).map((s) => [text.slice(s.from, s.to), s.name]);

test("extensions select a language; unknown ones none", () => {
  for (const path of ["a.cpp", "a.h", "a.hpp", "a.cc", "a.mm", "a.js", "a.sys.mjs", "a.jsm", "a.ts", "a.tsx", "a.jsx", "a.rs", "a.py", "a.html", "a.xhtml", "a.css", "a.json"]) {
    assert.ok(parserFor(path), path);
  }
  for (const path of ["README", "a.txt", "a.constructor", "Makefile"]) assert.equal(parserFor(path), undefined, path);
  assert.deepEqual(tokenize("a.txt", "int x;"), []);
});

test("tokenizes C++", () => {
  const spans = named("a.cpp", "#include <a.h>\nstatic int f() { return 42; } // hi");
  assert.ok(spans.some(([text, name]) => text === "static" && name === "syn-keyword"));
  assert.ok(spans.some(([text, name]) => text === "return" && name === "syn-keyword"));
  assert.ok(spans.some(([text, name]) => text === "42" && name === "syn-number"));
  assert.ok(spans.some(([text, name]) => text === "// hi" && name === "syn-comment"));
  assert.ok(spans.some(([text, name]) => text.startsWith("#include") && name === "syn-meta"));
});

test("tokenizes JS and TS dialects", () => {
  const js = named("a.mjs", "const s = 'x';");
  assert.ok(js.some(([text, name]) => text === "const" && name === "syn-keyword"));
  assert.ok(js.some(([text, name]) => text === "'x'" && name === "syn-string"));
  const ts = named("a.ts", "let n: number = 1;");
  assert.ok(ts.some(([text, name]) => text === "number" && name === "syn-type"));
});

test("a span over several lines yields one segment per line", () => {
  const lines = ["a /* x", "", "y */ b"];
  const text = lines.join("\n");
  const comment = tokenize("a.c", text).find((s) => s.name === "syn-comment")!;
  assert.deepEqual(lineSegments(lines, [comment]), [
    { line: 0, start: 2, end: 6, name: "syn-comment" },
    { line: 2, start: 0, end: 4, name: "syn-comment" },
  ]);
});

test("diff rows are tokenized per side, so a comment spanning added lines is one token", () => {
  const rows: CodeRow[] = [
    { kind: "ctx", text: "int a;", old: 1, new: 1 },
    { kind: "del", text: "return 0;", old: 2 },
    { kind: "add", text: "/* start", new: 2 },
    { kind: "add", text: "end */ int b;", new: 3 },
  ];
  const segments = rowSegments("a.cpp", rows);
  assert.deepEqual(segments.filter((s) => s.name === "syn-comment"), [
    { row: 2, start: 0, end: 8, name: "syn-comment" },
    { row: 3, start: 0, end: 6, name: "syn-comment" },
  ]);
  assert.ok(segments.some((s) => s.row === 1 && s.start === 0 && s.end === 6 && s.name === "syn-keyword"));
  assert.ok(segments.some((s) => s.row === 3 && s.start === 7 && s.end === 10));
});

test("line-number gaps between hunks start a new fragment", () => {
  const rows: CodeRow[] = [
    { kind: "add", text: "/* open", new: 1 },
    { kind: "add", text: "*/ int x;", new: 50 },
  ];
  assert.ok(!rowSegments("a.cpp", rows).some((s) => s.row === 1 && s.name === "syn-comment" && s.start === 0 && s.end === 2));
});

test("an edit reparsed incrementally changes only the lines whose tokens change", () => {
  const before = ["int a = 1;", "int b = 2;", "int c = 3;"];
  const tokenizer = new IncrementalTokenizer("a.cpp");
  const segs = (lines: string[], spans: Span[]) => segmentsByLine(lines, spans);
  const first = segs(before, tokenizer.update(before.join("\n")));

  const edited = ["int a = 1;", "int b = 22;", "int c = 3;"];
  const at = before[0].length + 1 + "int b = 2".length;
  const second = segs(edited, tokenizer.update(edited.join("\n"), { from: at, to: at, inserted: 1 }));
  assert.deepEqual(changedLines(first, second), [1]);
  assert.deepEqual(second, segs(edited, tokenize("a.cpp", edited.join("\n"))));

  const opened = ["int a = 1;", "/* int b = 22;", "int c = 3;"];
  const start = before[0].length + 1;
  const third = segs(opened, tokenizer.update(opened.join("\n"), { from: start, to: start, inserted: 3 }));
  assert.deepEqual(changedLines(second, third), [1, 2]);
  assert.deepEqual(third, segs(opened, tokenize("a.cpp", opened.join("\n"))));
});
