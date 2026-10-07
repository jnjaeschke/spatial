import type { Artifact, ChatMessageData, ChatThreadData, DiffData, Id, Link, PatchNarrativeData, PhabCommentData, Ref, ReviewFindingData, SpecReferenceData, WorkflowStartData } from "../shared/types.ts";
import { revisedText } from "../shared/revisions.ts";
import type { Store } from "./store.ts";
import { renderHunk } from "../tasks/narrate/render.ts";
import { latestDiff, narrativeOf } from "../shared/epochs.ts";
import { findingStates } from "../shared/findings.ts";
import { latestPhabComments, phabLatest, phabThread } from "../shared/phab-comments.ts";

/** What rendering needs from one session; built from Store lists. */
export interface SessionView { artifacts: Artifact[]; links: Link[] }
export interface SearchDoc { ref: Ref; kind: "change" | "summary" | "hunk" | "commit" | "spec" | "chat" | "finding" | "comment"; body: string }

export function sessionView(store: Store, sessionId: Id): SessionView {
  return { artifacts: store.listArtifacts(sessionId), links: store.listLinks(sessionId) };
}

export function searchDocs(view: SessionView, artifact: Artifact): SearchDoc[] {
  if (artifact.type === "PhabComment") {
    if (phabLatest(view.artifacts, artifact.id)?.id !== artifact.id) return [];
    const data = artifact.data as PhabCommentData;
    return [{ ref: artifact.id, kind: "comment", body: `@${data.author} ${data.path ?? ""}\n${data.body}` }];
  }
  if (artifact.type === "Diff") {
    const diff = artifact.data as DiffData;
    return [
      ...diff.files.flatMap((file) => file.hunks.map((hunk) => ({
        ref: artifact.id + "#" + hunk.id, kind: "hunk" as const,
        body: [file.path, hunk.header, ...hunk.lines.map((line) => (line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ") + line.text)].join("\n"),
      }))),
      { ref: artifact.id, kind: "commit", body: artifact.id + "\n" + diff.commits.map((commit) => commit.subject + "\n" + commit.body).join("\n") },
    ];
  }
  if (artifact.type === "PatchNarrative") {
    const narrative = artifact.data as PatchNarrativeData;
    return [
      { ref: artifact.id, kind: "summary", body: narrative.summary },
      ...narrative.changes.map((change) => ({ ref: artifact.id + "#" + change.id, kind: "change" as const, body: change.title + "\n" + change.explanation + "\n" + change.rationale })),
    ];
  }
  if (artifact.type === "SpecReference") {
    const spec = artifact.data as SpecReferenceData;
    return [{ ref: artifact.id, kind: "spec", body: spec.resolved ? spec.resolved.title + "\n" + spec.resolved.content : spec.url + "\n" + (spec.reason ?? "") }];
  }
  if (artifact.type === "ChatMessage") {
    const text = (artifact.data as Partial<ChatMessageData>).text;
    return typeof text === "string" ? [{ ref: artifact.id, kind: "chat", body: revisedText(view, artifact as Artifact<ChatMessageData>) }] : [];
  }
  if (artifact.type === "ReviewFinding") {
    const finding = artifact.data as ReviewFindingData;
    return [{ ref: artifact.id, kind: "finding", body: finding.title + "\n" + finding.body }];
  }
  return [];
}

/** Markdown for a ref. Throws Unknown ref when nothing matches. */
export function renderRef(view: SessionView, ref: Ref): string {
  const parts = ref.split("#");
  const id = parts[0], subId = parts[1];
  const artifact = view.artifacts.find((item) => item.id === id);
  if (!artifact || parts.length > 2) throw new Error("Unknown ref: " + ref);
  if (artifact.type === "WorkflowStart" && subId === undefined) {
    const data = artifact.data as WorkflowStartData;
    return `# Session request (${data.workflow})\n\n${data.prompt}`;
  }
  if (artifact.type === "PhabComment" && subId === undefined) {
    const comments = phabThread(view.artifacts, id);
    if (!comments.length) throw new Error("Unknown ref: " + ref);
    const root = comments[0]!.data;
    const location = root.path ? `Location: ${root.path}:${root.line} (${root.isNewFile ? "new" : "old"} side, diff ${root.diffId})` : "Location: general comment";
    return [`# Phabricator comment by @${root.author} on D${root.revision}`, location, `Done: ${root.done ? "yes" : "no"}`, root.body, ...comments.slice(1).map((item) => `Reply by @${item.data.author}: ${item.data.body}`)].join("\n\n");
  }
  const linkedSpecs = (narrativeId: string, changeId: string) => view.artifacts.filter((item) => item.type === "SpecReference" && view.links.some((link) => link.from === item.id && link.to === narrativeId + "#" + changeId && link.kind === "supports"));
  if (artifact.type === "PatchNarrative") {
    const narrative = artifact.data as PatchNarrativeData;
    if (subId === undefined) return "# Summary\n" + narrative.summary + "\n\n# Changes\n" + narrative.changes.map((change) => "- " + artifact.id + "#" + change.id + ": " + change.title).join("\n");
    const commitAnchor = /^commit-(\d+)$/.exec(subId);
    if (commitAnchor) {
      const index = Number(commitAnchor[1]);
      const diffArtifact = view.artifacts.find((item) => item.id === narrative.diffId && item.type === "Diff");
      const diff = diffArtifact?.data as DiffData | undefined;
      const commit = diff?.commits[index];
      if (!commit) throw new Error("Unknown ref: " + ref);
      const files = diff.files.filter((file) => file.hunks.some((hunk) => hunk.lines.some((line) => line.commit === index)));
      return [`# Commit ${index + 1} of ${diff.commits.length}`, `Commit: ${commit.sha.slice(0, 12)}`, `Subject: ${commit.subject}`, ...(commit.body ? [`Body:\n${commit.body}`] : []), "# Changed files", ...(files.length ? files.map((file) => `- ${file.path} (${file.status})`) : ["None"])].join("\n\n");
    }
    const change = narrative.changes.find((item) => item.id === subId);
    if (!change) throw new Error("Unknown ref: " + ref);
    const diffArtifact = view.artifacts.find((item) => item.id === narrative.diffId && item.type === "Diff");
    const diff = diffArtifact?.data as DiffData | undefined;
    const hunks = diff ? diff.files.flatMap((file) => file.hunks.filter((hunk) => change.hunkIds.includes(hunk.id)).map((hunk) => renderHunk(file, hunk))) : [];
    const specs = linkedSpecs(artifact.id, change.id).map((item) => {
      const data = item.data as SpecReferenceData;
      return "## Spec " + item.id + "\n" + (data.resolved?.title ?? data.url);
    });
    return ["# " + change.title, change.explanation, "## Rationale\n" + change.rationale, "## Depends on\n" + (change.dependsOn.join(", ") || "None"), ...hunks, ...specs].join("\n\n");
  }
  if (artifact.type === "Diff") {
    const diff = artifact.data as DiffData;
    if (subId === undefined) return "# Commits\n" + diff.commits.map((commit) => "- " + commit.subject + (commit.body ? "\n  " + commit.body : "")).join("\n") + "\n\n# Files\n" + diff.files.map((file) => "- " + file.path + " (" + file.status + ")").join("\n");
    const found = diff.files.flatMap((file) => file.hunks.filter((hunk) => hunk.id === subId).map((hunk) => ({ file, hunk })))[0];
    if (!found) throw new Error("Unknown ref: " + ref);
    const narrative = [...view.artifacts].reverse().find((item) => item.type === "PatchNarrative" && (item.data as PatchNarrativeData).diffId === artifact.id);
    const changes = narrative ? (narrative.data as PatchNarrativeData).changes.filter((change) => change.hunkIds.includes(subId)).map((change) => "## " + change.title + "\n" + change.explanation) : [];
    return [renderHunk(found.file, found.hunk), ...changes].join("\n\n");
  }
  if (artifact.type === "SpecReference" && subId === undefined) {
    const spec = artifact.data as SpecReferenceData;
    const supported = view.links.filter((link) => link.from === artifact.id && link.kind === "supports").map((link) => link.to);
    const gecko = spec.geckoRefs.map((item) => "- " + item.group + ": " + item.path + ":" + item.line + " (" + item.url + ")").join("\n");
    return ["# " + (spec.resolved?.title ?? "Unresolved spec reference"), "Spec: " + (spec.resolved?.spec ?? "Unknown"), "URL: " + (spec.resolved?.url ?? spec.url), "Origin: " + (spec.origin ?? "unknown"), spec.resolved?.content ?? (spec.url + "\n" + (spec.reason ?? "No resolution reason provided.")), "## Gecko references\n" + (gecko || "None"), "## Supported changes\n" + (supported.join("\n") || "None")].join("\n\n");
  }
  if (artifact.type === "ChatThread" && subId === undefined) {
    const thread = artifact.data as ChatThreadData;
    const messages = view.links.filter((link) => link.to === artifact.id && link.kind === "reply").map((link) => view.artifacts.find((item) => item.id === link.from)).filter((item): item is Artifact => item?.type === "ChatMessage");
    return ["# Chat " + artifact.id, "Anchor: " + thread.anchor, ...messages.map((item) => ((item.data as ChatMessageData).role === "user" ? "User: " : "Assistant: ") + revisedText(view, item as Artifact<ChatMessageData>))].join("\n\n");
  }
  if (artifact.type === "ReviewFinding" && subId === undefined) {
    const data = artifact.data as ReviewFindingData;
    return ["# Finding " + artifact.id + ": " + data.title, "Category: " + data.category + ", severity: " + data.severity, "Anchor: " + data.anchor, ...(data.quote ? ["> " + data.quote] : []), data.body].join("\n\n");
  }
  if (artifact.type === "ChatMessage" && subId === undefined) {
    const parent = view.links.find((link) => link.from === artifact.id && link.kind === "reply");
    if (parent) return renderRef(view, parent.to);
  }
  throw new Error("Unknown ref: " + ref);
}

/** Overview of the session for its workflow: the latest narrative's summary, commits, changes, spec refs, threads, findings and remote comments for review; title, request and thread count for chat. */
export function sessionOverview(view: SessionView): string {
  const start = view.artifacts.findLast((artifact) => artifact.type === "WorkflowStart") as Artifact<WorkflowStartData> | undefined;
  if (start?.data.workflow === "chat") {
    const threads = view.artifacts.filter((artifact) => artifact.type === "ChatThread");
    return ["# Conversation\n" + start.data.title, "# Request\n" + start.data.prompt, "# Threads\n" + threads.length + " thread" + (threads.length === 1 ? "" : "s")].join("\n\n");
  }
  const diffArtifact = latestDiff(view.artifacts);
  const latest = diffArtifact ? narrativeOf(view.artifacts, diffArtifact.id) : null;
  if (!latest) return "No narrative yet.";
  const narrative = latest.data as PatchNarrativeData;
  const commits = diffArtifact!.data.commits.map((commit) => "- " + commit.subject + (commit.body ? "\n  " + commit.body : "")).join("\n");
  const changes = narrative.changes.map((change) => "- " + latest.id + "#" + change.id + ": " + change.title + " (hunks: " + (change.hunkIds.join(", ") || "none") + ")").join("\n") || "None";
  const currentChangeRefs = new Set(narrative.changes.map((change) => latest.id + "#" + change.id));
  const currentSpecIds = new Set(view.links.filter((link) => link.kind === "supports" && currentChangeRefs.has(link.to)).map((link) => link.from));
  const specs = view.artifacts.filter((artifact) => artifact.type === "SpecReference" && currentSpecIds.has(artifact.id)).map((artifact) => {
    const data = artifact.data as SpecReferenceData;
    return "- " + artifact.id + ": " + (data.resolved?.title ?? data.url) + " (" + (data.origin ?? "unknown") + ")";
  }).join("\n") || "None";
  const threads = view.artifacts.filter((artifact) => artifact.type === "ChatThread").map((artifact) => {
    const first = view.links.filter((link) => link.to === artifact.id && link.kind === "reply").map((link) => view.artifacts.find((item) => item.id === link.from)).find((item) => item?.type === "ChatMessage" && (item.data as ChatMessageData).role === "user");
    return "- " + artifact.id + " anchored at " + (artifact.data as ChatThreadData).anchor + ": " + (first ? (first.data as ChatMessageData).text : "");
  }).join("\n") || "None";
  const findings = findingStates(view, latest.id).map((state) => {
    const data = state.finding.data;
    return "- " + state.finding.id + " [" + data.severity + " " + data.category + "] " + data.title + " (" + (state.outdated ? "location outdated" : state.anchor) + ")";
  }).join("\n") || "None";
  const remoteComments = latestPhabComments(view.artifacts).filter((artifact) => !artifact.data.replyTo).map((artifact) => {
    const data = artifact.data;
    const location = data.path ? `${data.path}:${data.line}` : "general";
    const body = data.body.split(/\r?\n/, 1)[0]!.slice(0, 80);
    return `- ${artifact.id} @${data.author} (${location})${data.done ? ", done" : ""} : ${body}`;
  });
  return ["# Summary\n" + narrative.summary, "# Commits\n" + commits, "# Changes\n" + changes, "# Specs\n" + specs, "# Threads\n" + threads, "# Findings\n" + findings, ...(remoteComments.length ? ["# Remote comments\n" + remoteComments.join("\n")] : [])].join("\n\n");
}
