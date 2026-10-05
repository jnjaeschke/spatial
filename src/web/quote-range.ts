import type { ChatThreadData, Ref } from "../shared/types.ts";

/**
 * Range of `quote` inside the rendered anchor under `root`, or null when the anchor (or those lines) is not
 * rendered or the quote is not found. Compares ignoring all whitespace: `Selection.toString()` inserts tabs and
 * newlines between table cells and blocks that the DOM text does not contain. Text a selection cannot contain
 * (`user-select: none`, like diff line numbers) is skipped. The first match wins.
 */
export function quoteRange(root: ParentNode, anchor: Ref, quote: string, lines?: ChatThreadData["lines"]): Range | null {
  const selector = `[data-anchor="${CSS.escape(anchor)}"]`;
  let scopes = [...root.querySelectorAll<HTMLElement>(selector)].filter((el) => !el.parentElement?.closest(selector));
  if (lines) {
    const rows = scopes.filter((el) => el.tagName === "TR" && el.dataset.path === lines.path);
    const line = (tr: HTMLElement) => Number(lines.side === "new" ? tr.dataset.new : tr.dataset.old);
    const first = rows.findIndex((tr) => line(tr) >= lines.start);
    const last = rows.findLastIndex((tr) => line(tr) <= lines.end);
    scopes = first >= 0 && last >= first ? rows.slice(first, last + 1) : [];
  }
  const needle = quote.replace(/\s+/g, "");
  if (!needle) return null;
  let flat = "";
  const at: { node: Text; offset: number }[] = [];
  for (const scope of scopes) {
    const walker = scope.ownerDocument.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, (node) =>
      node instanceof Element && getComputedStyle(node).userSelect === "none" ? NodeFilter.FILTER_REJECT
        : node instanceof Text ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      for (let i = 0; i < node.data.length; i++) {
        if (/\s/.test(node.data[i]!)) continue;
        flat += node.data[i];
        at.push({ node, offset: i });
      }
    }
  }
  const index = flat.indexOf(needle);
  if (index < 0) return null;
  const range = scopes[0]?.ownerDocument.createRange();
  if (!range) return null;
  range.setStart(at[index]!.node, at[index]!.offset);
  const end = at[index + needle.length - 1]!;
  range.setEnd(end.node, end.offset + 1);
  return range;
}
