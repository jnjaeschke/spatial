import type { ChatThreadData, DiagramData, SessionState } from "../shared/types.ts";
import { latestDiff } from "../plugins/review/shared/diffs.ts";

/** A session snapshot embedded in a static export file. */
export interface SessionExport {
  version: 1;
  exportedAt: string;
  state: SessionState;
  /** Head-side lines of the latest diff's modified files, by path; null when over the size cap. */
  files: Record<string, string[] | null>;
  /** The exporter's view state (localStorage values by key). */
  view: Record<string, string>;
}

const CLOSABLE = new Set(["ChatThread", "Note", "Diagram"]);

/** The state as the canvas shows it: closed chats, notes and diagrams are dropped with everything that hangs off them (messages, replies, revisions, derived diagrams), and so are diagrams the canvas does not show (not the latest sequence diagram of a reviewed commit). Only the tasks the canvas reads are kept, since task inputs carry prompts. */
export function exportState(state: SessionState, closed: ReadonlySet<string>): SessionState {
  const dropped = new Set(state.artifacts.filter((a) => closed.has(a.id) && CLOSABLE.has(a.type)).map((a) => a.id));
  const commits = new Set(latestDiff(state.artifacts)?.data.commits.map((commit) => commit.sha) ?? []);
  const shownDiagram = new Map<string, string>();
  for (const a of state.artifacts) {
    const data = a.data as DiagramData;
    if (a.type === "Diagram" && data.kind === "sequence" && commits.has(data.commit)) shownDiagram.set(data.commit, a.id);
  }
  for (const a of state.artifacts) if (a.type === "Diagram" && shownDiagram.get((a.data as DiagramData).commit) !== a.id) dropped.add(a.id);
  for (let grew = dropped.size > 0; grew;) {
    grew = false;
    const drop = (id: string) => { if (!dropped.has(id)) { dropped.add(id); grew = true; } };
    for (const link of state.links) if (dropped.has(link.to)) drop(link.from);
    for (const a of state.artifacts) if (a.type === "ChatThread" && dropped.has((a.data as ChatThreadData).anchor)) drop(a.id);
  }
  return {
    ...state,
    artifacts: state.artifacts.filter((a) => !dropped.has(a.id)),
    links: state.links.filter((l) => !dropped.has(l.from) && !dropped.has(l.to)),
    tasks: state.tasks.filter((t) => t.kind === "resolveSpecRefs" && t.status === "succeeded"),
  };
}

// Escaping `<` keeps JSON valid and makes `</script>` impossible inside the script element.
const scriptJson = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c");

/** A self-contained page: the built CSS, the export data and the bundle (imported from a Blob URL, so its text needs no HTML escaping). */
export function exportHtml(title: string, css: string, js: string, data: SessionExport): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)} · spatial-ide export</title>
<style>${css.replaceAll("</style", "<\\/style")}</style>
<script type="application/json" id="spatial-export">${scriptJson(data)}</script>
<script type="application/json" id="spatial-bundle">${scriptJson(js)}</script>
<script type="module">import(URL.createObjectURL(new Blob([JSON.parse(document.getElementById("spatial-bundle").textContent)], { type: "text/javascript" })));</script>
</head>
<body><div id="root"></div></body>
</html>
`;
}
