import type { ChatThreadData, Ref } from "../../shared/types.ts";

export interface SelectedText { quote: string; lines?: ChatThreadData["lines"] }

function renderSelection(selection: SelectedText): string {
  const line = selection.lines
    ? `\n\n(lines ${selection.lines.start}–${selection.lines.end} of ${selection.lines.path}, ${selection.lines.side} side)`
    : "";
  return `# Selected text\n\n> ${selection.quote.replaceAll("\n", "\n> ")}${line}`;
}

/** The minimal chat context: session overview, the anchored ref, and the user's selection. Throws on an unknown anchor. */
export function buildAnchorContext(anchor: Ref, opts: { overview: string[]; context: string[]; render(ref: Ref): string }, selection?: SelectedText): string {
  return ["# Session", opts.overview.join("\n\n"), ...opts.context, "# You are asked about", opts.render(anchor), ...(selection ? [renderSelection(selection)] : [])].filter(Boolean).join("\n\n");
}
