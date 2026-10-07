import type { ChatThreadData, Ref } from "../../shared/types.ts";
import type { SessionView } from "../../runtime/render-ref.ts";
import { renderRef, sessionOverview } from "../../runtime/render-ref.ts";
import { latestDiff } from "../../shared/epochs.ts";

export interface SelectedText { quote: string; lines?: ChatThreadData["lines"] }

function renderSelection(selection: SelectedText): string {
  const line = selection.lines
    ? `\n\n(lines ${selection.lines.start}–${selection.lines.end} of ${selection.lines.path}, ${selection.lines.side} side)`
    : "";
  return `# Selected text\n\n> ${selection.quote.replaceAll("\n", "\n> ")}${line}`;
}

/** The minimal chat context: session overview, the anchored ref, and the user's selection. Throws on an unknown anchor. */
export function buildAnchorContext(view: SessionView, anchor: Ref, selection?: SelectedText): string {
  const diff = latestDiff(view.artifacts);
  const commits = diff?.data.commits.length
    ? ["# Commits in the reviewed range", ...diff.data.commits.map((commit, index) => `${index + 1}. ${commit.sha.slice(0, 12)} ${commit.subject}`)].join("\n")
    : "";
  return ["# Session", sessionOverview(view), commits, "# You are asked about", renderRef(view, anchor), ...(selection ? [renderSelection(selection)] : [])].filter(Boolean).join("\n\n");
}
