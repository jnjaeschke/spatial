import type { ChatThreadData, Ref } from "../shared/types.ts";

export interface SelectionResult { anchor: Ref; quote: string; lines?: ChatThreadData["lines"] }

function element(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === 1 ? node as Element : node.parentElement;
}

export function anchorOfSelection(sel: Selection): SelectionResult | null {
  if (sel.isCollapsed) return null;
  const quote = sel.toString().trim();
  if (!quote) return null;
  const start = element(sel.anchorNode)?.closest<HTMLElement>("[data-anchor]");
  const end = element(sel.focusNode)?.closest<HTMLElement>("[data-anchor]");
  if (!start || !end) return null;
  const anchor = start.dataset.anchor;
  if (!anchor || anchor !== end.dataset.anchor) return null;

  let lines: ChatThreadData["lines"];
  const first = element(sel.anchorNode)?.closest<HTMLTableRowElement>("tr[data-anchor]");
  const last = element(sel.focusNode)?.closest<HTMLTableRowElement>("tr[data-anchor]");
  if (first && last && first.dataset.anchor === anchor && last.dataset.anchor === anchor) {
    const path = first.dataset.path;
    const lastPath = last.dataset.path;
    const side = first.dataset.new && last.dataset.new ? "new" : first.dataset.old && last.dataset.old ? "old" : undefined;
    const a = side === "new" ? Number(first.dataset.new) : side === "old" ? Number(first.dataset.old) : NaN;
    const b = side === "new" ? Number(last.dataset.new) : side === "old" ? Number(last.dataset.old) : NaN;
    if (path && path === lastPath && side && Number.isInteger(a) && Number.isInteger(b)) {
      lines = { path, side, start: Math.min(a, b), end: Math.max(a, b) };
    }
  }
  return { anchor, quote, ...(lines ? { lines } : {}) };
}
