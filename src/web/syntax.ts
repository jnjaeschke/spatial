import { TreeFragment, type Parser, type Tree } from "@lezer/common";
import { highlightTree, tagHighlighter, tags as t } from "@lezer/highlight";
import { parser as cpp } from "@lezer/cpp";
import { parser as css } from "@lezer/css";
import { parser as html } from "@lezer/html";
import { parser as json } from "@lezer/json";
import { parser as javascript } from "@lezer/javascript";
import { parser as python } from "@lezer/python";
import { parser as rust } from "@lezer/rust";

/**
 * Syntax highlighting without touching the DOM text: code is tokenized with Lezer and the tokens are
 * painted through named entries of the CSS Custom Highlight API (`::highlight(syn-*)` in styles.css).
 */

export interface Span { from: number; to: number; name: string }
export interface Segment { row: number; start: number; end: number; name: string }
export interface CodeRow { kind: "ctx" | "add" | "del"; text: string; old?: number; new?: number }

const javascriptDialects = {
  js: javascript,
  jsx: javascript.configure({ dialect: "jsx" }),
  ts: javascript.configure({ dialect: "ts" }),
  tsx: javascript.configure({ dialect: "ts jsx" }),
};

const parsers: Record<string, Parser> = {
  c: cpp, h: cpp, cc: cpp, cpp: cpp, cxx: cpp, hh: cpp, hpp: cpp, hxx: cpp, mm: cpp,
  js: javascriptDialects.js, mjs: javascriptDialects.js, jsm: javascriptDialects.js, cjs: javascriptDialects.js,
  jsx: javascriptDialects.jsx,
  ts: javascriptDialects.ts, mts: javascriptDialects.ts,
  tsx: javascriptDialects.tsx,
  rs: rust,
  py: python,
  html: html, xhtml: html,
  css: css,
  json: json,
};

/** The parser for a file path's extension, if the language is supported. */
export function parserFor(path: string): Parser | undefined {
  const dot = path.lastIndexOf(".");
  const ext = path.slice(dot + 1).toLowerCase();
  return dot >= 0 && Object.hasOwn(parsers, ext) ? parsers[ext] : undefined;
}

const highlighter = tagHighlighter([
  { tag: t.keyword, class: "syn-keyword" },
  { tag: [t.string, t.regexp, t.special(t.string)], class: "syn-string" },
  { tag: t.comment, class: "syn-comment" },
  { tag: [t.number, t.bool, t.null, t.atom], class: "syn-number" },
  { tag: [t.typeName, t.className, t.namespace], class: "syn-type" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: "syn-function" },
  { tag: [t.propertyName, t.attributeName], class: "syn-property" },
  { tag: t.operator, class: "syn-operator" },
  { tag: [t.meta, t.processingInstruction], class: "syn-meta" },
  { tag: t.tagName, class: "syn-tag" },
]);

function treeSpans(tree: Tree): Span[] {
  const spans: Span[] = [];
  highlightTree(tree, highlighter, (from, to, classes) => spans.push({ from, to, name: classes.split(" ")[0] }));
  return spans;
}

const CACHE_SIZE = 200;
const cache = new Map<string, Span[]>();

/** Highlighted spans of `text` (code of the language of `path`); empty for unknown languages. */
export function tokenize(path: string, text: string): Span[] {
  const parser = parserFor(path);
  if (!parser) return [];
  const key = `${path.slice(path.lastIndexOf("."))}\0${text}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const spans = treeSpans(parser.parse(text));
  cache.set(key, spans);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return spans;
}

/** Splits spans over `\n`-joined lines into per-line segments. */
export function lineSegments(lines: string[], spans: Span[]): { line: number; start: number; end: number; name: string }[] {
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const out: { line: number; start: number; end: number; name: string }[] = [];
  let line = 0;
  for (const span of spans) {
    while (line < lines.length - 1 && span.from >= starts[line + 1]) line++;
    for (let at = line; at < lines.length && starts[at] < span.to; at++) {
      const start = Math.max(span.from, starts[at]) - starts[at];
      const end = Math.min(span.to, starts[at] + lines[at].length) - starts[at];
      if (end > start) out.push({ line: at, start, end, name: span.name });
    }
  }
  return out;
}

/**
 * Segments over the diff rows: the new side (context and added rows) and the old side (context and
 * deleted rows) are each tokenized as source text; line-number gaps (between hunks) start a new fragment.
 */
export function rowSegments(path: string, rows: CodeRow[]): Segment[] {
  const out: Segment[] = [];
  for (const side of ["old", "new"] as const) {
    let run: number[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const lines = run.map((i) => rows[i].text);
      for (const seg of lineSegments(lines, tokenize(path, lines.join("\n")))) out.push({ row: run[seg.line], start: seg.start, end: seg.end, name: seg.name });
      run = [];
    };
    for (let i = 0; i < rows.length; i++) {
      const n = rows[i][side];
      if (n === undefined) continue;
      const previous = run.length > 0 ? rows[run[run.length - 1]][side] : undefined;
      if (previous !== undefined && n !== previous + 1) flush();
      run.push(i);
    }
    flush();
  }
  return out;
}

/** A document edit: `[from, to)` of the previous text was replaced by `inserted` characters. */
export interface Change { from: number; to: number; inserted: number }

/** Tokenizes one evolving document, reusing the previous parse tree across edits. */
export class IncrementalTokenizer {
  private tree: Tree | undefined;
  private fragments: readonly TreeFragment[] = [];

  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  /** Spans of the new `text`; `change` describes the edit relative to the previous call's text. */
  update(text: string, change?: Change): Span[] {
    const parser = parserFor(this.path);
    if (!parser) return [];
    if (this.tree && change) {
      const fragments = TreeFragment.addTree(this.tree, this.fragments);
      this.fragments = TreeFragment.applyChanges(fragments, [{ fromA: change.from, toA: change.to, fromB: change.from, toB: change.from + change.inserted }]);
    } else {
      this.fragments = [];
    }
    this.tree = parser.parse(text, this.fragments);
    return treeSpans(this.tree);
  }
}

export type LineSegment = Omit<Segment, "row">;

/** Per-line segments of `\n`-joined lines, indexed by line. */
export function segmentsByLine(lines: string[], spans: Span[]): LineSegment[][] {
  const out: LineSegment[][] = lines.map(() => []);
  for (const { line, ...seg } of lineSegments(lines, spans)) out[line].push(seg);
  return out;
}

export function sameSegments(a: LineSegment[], b: LineSegment[]): boolean {
  return a.length === b.length && a.every((x, i) => x.start === b[i].start && x.end === b[i].end && x.name === b[i].name);
}

/** Lines whose segments differ; both arrays describe documents with the same line count. */
export function changedLines(before: LineSegment[][], after: LineSegment[][]): number[] {
  return after.flatMap((segs, line) => sameSegments(before[line], segs) ? [] : [line]);
}

const highlights = new Map<string, Highlight>();

function highlightFor(name: string): Highlight {
  let highlight = highlights.get(name);
  if (!highlight) {
    highlight = new Highlight();
    highlight.priority = -1;
    highlights.set(name, highlight);
    CSS.highlights.set(name, highlight);
  }
  return highlight;
}

interface PaintedRow { node: Text; data: string; segments: LineSegment[]; ranges: [Highlight, Range][] }

/**
 * Owns the ranges of one code view, keyed by row. `update` replaces only the rows whose text node,
 * text or segments changed, so untouched rows keep their Range objects. `dispose` removes everything,
 * keeping the shared highlights bounded to mounted views.
 */
export class RowPainter {
  private readonly rows = new Map<number, PaintedRow>();

  /** `cells[i]` is the code cell of row i; `segments` come from `rowSegments`. */
  update(cells: (Element | null)[], segments: Segment[]): void {
    const byRow = new Map<number, LineSegment[]>();
    for (const { row, ...seg } of segments) byRow.set(row, [...(byRow.get(row) ?? []), seg]);
    for (const row of [...this.rows.keys()]) {
      if (!byRow.has(row) || row >= cells.length) this.clear(row);
    }
    for (const [row, segs] of byRow) {
      const node = cells[row]?.firstChild;
      if (node?.nodeType !== Node.TEXT_NODE) {
        this.clear(row);
        continue;
      }
      const text = node as Text;
      const old = this.rows.get(row);
      if (old && old.node === text && old.data === text.data && sameSegments(old.segments, segs)) continue;
      this.clear(row);
      const ranges = segs.map((seg): [Highlight, Range] => {
        const range = new Range();
        range.setStart(text, seg.start);
        range.setEnd(text, seg.end);
        const highlight = highlightFor(seg.name);
        highlight.add(range);
        return [highlight, range];
      });
      this.rows.set(row, { node: text, data: text.data, segments: segs, ranges });
    }
  }

  dispose(): void {
    for (const row of [...this.rows.keys()]) this.clear(row);
  }

  private clear(row: number): void {
    for (const [highlight, range] of this.rows.get(row)?.ranges ?? []) highlight.delete(range);
    this.rows.delete(row);
  }
}
