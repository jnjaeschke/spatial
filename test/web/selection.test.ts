import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorOfSelection } from "../../src/web/selection.ts";

function endpoint(anchor: string, row?: { path: string; old?: string; new?: string }) {
  const rowElement = row ? { dataset: { anchor, ...row }, closest: (selector: string) => selector === "tr[data-anchor]" ? rowElement : rowElement } : null;
  const anchorElement = { dataset: { anchor }, closest: () => anchorElement };
  const node = { nodeType: 3, parentElement: rowElement ?? anchorElement };
  return { node, anchorElement, rowElement };
}

function selection(a: ReturnType<typeof endpoint>, b: ReturnType<typeof endpoint>, text = " selected ", collapsed = false) {
  return { anchorNode: a.node, focusNode: b.node, isCollapsed: collapsed, toString: () => text } as unknown as Selection;
}

test("anchorOfSelection rejects collapsed, empty, unanchored, and cross-anchor selections", () => {
  const a = endpoint("N#c1"), b = endpoint("N#c2");
  assert.equal(anchorOfSelection(selection(a, a, "text", true)), null);
  assert.equal(anchorOfSelection(selection(a, a, "  ")), null);
  assert.equal(anchorOfSelection(selection(a, b)), null);
  const unanchored = { node: { nodeType: 3, parentElement: { closest: () => null } } } as unknown as ReturnType<typeof endpoint>;
  assert.equal(anchorOfSelection(selection(unanchored, unanchored)), null);
});

test("anchorOfSelection accepts same-hunk rows and spans line numbers", () => {
  const a = endpoint("D#f0h0", { path: "a.txt", new: "4" });
  const b = endpoint("D#f0h0", { path: "a.txt", new: "7" });
  assert.deepEqual(anchorOfSelection(selection(a, b)), { anchor: "D#f0h0", quote: "selected", lines: { path: "a.txt", side: "new", start: 4, end: 7 } });
});
