import type { Artifact, ChatMessageData, ChatThreadData, Id, Link, NoteData, Ref, WorkflowStartData } from "../shared/types.ts";
import { revisedText } from "../shared/revisions.ts";
import type { Store } from "./store.ts";
import type { ArtifactKind, PluginRegistry } from "./plugins.ts";

/** What rendering needs from one session; built from Store lists. */
export interface SessionView { artifacts: Artifact[]; links: Link[] }
export interface SearchDoc { ref: Ref; kind: string; body: string }

export function sessionView(store: Store, sessionId: Id): SessionView { return { artifacts: store.listArtifacts(sessionId), links: store.listLinks(sessionId) }; }

const coreSearch: ArtifactKind["search"] = (view, artifact) => {
  if (artifact.type === "Note") return [{ ref: artifact.id, kind: "note", body: (artifact.data as NoteData).body }];
  if (artifact.type === "ChatMessage") {
    const text = (artifact.data as Partial<ChatMessageData>).text;
    return typeof text === "string" ? [{ ref: artifact.id, kind: "chat", body: revisedText(view, artifact as Artifact<ChatMessageData>) }] : [];
  }
  return [];
};
const coreRender: ArtifactKind["render"] = (view, artifact, subId, renderRef) => {
  if (subId !== undefined) return null;
  if (artifact.type === "Note") return "# Draft Note\n\n" + (artifact.data as NoteData).body;
  if (artifact.type === "WorkflowStart") { const d = artifact.data as WorkflowStartData; return `# Session request (${d.workflow})\n\n${d.prompt}`; }
  if (artifact.type === "ChatThread") {
    const thread = artifact.data as ChatThreadData;
    const messages = view.links.filter((link) => link.to === artifact.id && link.kind === "reply").map((link) => view.artifacts.find((item) => item.id === link.from)).filter((item): item is Artifact => item?.type === "ChatMessage");
    return ["# Chat " + artifact.id, "Anchor: " + thread.anchor, ...messages.map((item) => ((item.data as ChatMessageData).role === "user" ? "User: " : "Assistant: ") + revisedText(view, item as Artifact<ChatMessageData>))].join("\n\n");
  }
  if (artifact.type === "ChatMessage") { const parent = view.links.find((link) => link.from === artifact.id && link.kind === "reply"); return parent ? renderRef(parent.to) : null; }
  return null;
};
export const coreArtifactKinds: Record<string, ArtifactKind> = {
  Note: { search: coreSearch, render: coreRender }, WorkflowStart: { render: coreRender }, ChatThread: { render: coreRender }, ChatMessage: { search: coreSearch, render: coreRender },
};

export function searchDocs(kinds: Record<string, ArtifactKind>, view: SessionView, artifact: Artifact): SearchDoc[] { return kinds[artifact.type]?.search?.(view, artifact) ?? []; }

/** Markdown for a ref. Throws Unknown ref when nothing matches. */
export function renderRef(kinds: Record<string, ArtifactKind>, view: SessionView, ref: Ref): string {
  const parts = ref.split("#"), id = parts[0]!, subId = parts[1];
  const artifact = view.artifacts.find((item) => item.id === id);
  if (!artifact || parts.length > 2) throw new Error("Unknown ref: " + ref);
  const rendered = kinds[artifact.type]?.render?.(view, artifact, subId, (nested) => renderRef(kinds, view, nested));
  if (rendered === null || rendered === undefined) throw new Error("Unknown ref: " + ref);
  return rendered;
}

/** Overview in prompt order: request, notes, workflow-specific sections, then chat threads. */
export function sessionOverview(registry: Pick<PluginRegistry, "workflows">, view: SessionView): string[] {
  const start = view.artifacts.findLast((artifact) => artifact.type === "WorkflowStart") as Artifact<WorkflowStartData> | undefined;
  const request = start ? "# Request\n" + start.data.prompt : null;
  const notes = view.artifacts.filter((artifact) => artifact.type === "Note") as Artifact<NoteData>[];
  const noteSection = notes.length ? "# Notes\n" + notes.length + " note" + (notes.length === 1 ? "" : "s") + "\n" + notes.map((note) => "- " + note.id + ": " + note.data.body.split(/\r?\n/, 1)[0]).join("\n") : null;
  const sections = start ? registry.workflows.get(start.data.workflow)?.overview?.(view) ?? [] : [];
  const threads = view.artifacts.filter((artifact) => artifact.type === "ChatThread").map((artifact) => {
    const first = view.links.filter((link) => link.to === artifact.id && link.kind === "reply").map((link) => view.artifacts.find((item) => item.id === link.from)).find((item) => item?.type === "ChatMessage" && (item.data as ChatMessageData).role === "user");
    return "- " + artifact.id + " anchored at " + (artifact.data as ChatThreadData).anchor + ": " + (first ? (first.data as ChatMessageData).text : "");
  }).join("\n") || "None";
  return [request, noteSection, ...sections, "# Threads\n" + threads].filter((section): section is string => Boolean(section));
}
