import type { Ref } from "../../shared/types.ts";
import type { SessionView } from "../../runtime/render-ref.ts";
import { renderRef, sessionOverview } from "../../runtime/render-ref.ts";

export interface SelectedText {
  quote: string;
  lines?: { start: number; end: number; path: string; side: string };
}

function renderSelection(selection: SelectedText): string {
  const line = selection.lines
    ? `\n\n(lines ${selection.lines.start}–${selection.lines.end} of ${selection.lines.path}, ${selection.lines.side} side)`
    : "";
  return `# Selected text\n\n> ${selection.quote.replaceAll("\n", "\n> ")}${line}`;
}

/** The minimal chat context: session overview, the anchored ref, and the user's selection. Throws on an unknown anchor. */
export function buildAnchorContext(view: SessionView, anchor: Ref, selection?: SelectedText): string {
  return ["# Session", sessionOverview(view), "# You are asked about", renderRef(view, anchor), ...(selection ? [renderSelection(selection)] : [])].join("\n\n");
}
