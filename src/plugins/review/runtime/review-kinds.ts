import type { PhabCommentData, ReviewDraftData, ReviewFindingData, UserCommentData } from "../shared/types.ts";
import type { DiffData, PatchNarrativeData, ArtifactKind, SessionView } from "../../../plugin-api.ts";
import type { SpecReferenceData } from "../../spec/api.ts";
import { renderHunk } from "../tasks/narrate/render.ts";
import { findingStates } from "../shared/findings.ts";
import { latestPhabComments, phabLatest, phabThread } from "../shared/phab-comments.ts";

const linkedSpecs = (view: SessionView, narrativeId: string, changeId: string) => view.artifacts.filter((item) => item.type === "SpecReference" && view.links.some((link) => link.from === item.id && link.to === narrativeId + "#" + changeId && link.kind === "supports"));

const search: ArtifactKind["search"] = (view, artifact) => {
  if (artifact.type === "PhabComment") {
    if (phabLatest(view.artifacts, artifact.id)?.id !== artifact.id) return [];
    const data = artifact.data as PhabCommentData;
    return [{ ref: artifact.id, kind: "comment", body: `@${data.author} ${data.path ?? ""}\n${data.body}` }];
  }
  if (artifact.type === "Diff") {
    const diff = artifact.data as DiffData;
    return [...diff.files.flatMap((file) => file.hunks.map((hunk) => ({ ref: artifact.id + "#" + hunk.id, kind: "hunk", body: [file.path, hunk.header, ...hunk.lines.map((line) => (line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ") + line.text)].join("\n") }))), { ref: artifact.id, kind: "commit", body: artifact.id + "\n" + diff.commits.map((commit) => commit.subject + "\n" + commit.body).join("\n") }];
  }
  if (artifact.type === "PatchNarrative") {
    const n = artifact.data as PatchNarrativeData;
    return [{ ref: artifact.id, kind: "summary", body: n.summary }, ...n.changes.map((change) => ({ ref: artifact.id + "#" + change.id, kind: "change", body: change.title + "\n" + change.explanation + "\n" + change.rationale }))];
  }
  if (artifact.type === "ReviewFinding") {
    const f = artifact.data as ReviewFindingData;
    return [{ ref: artifact.id, kind: "finding", body: f.title + "\n" + f.body }];
  }
  if (artifact.type === "UserComment") {
    const comment = artifact.data as UserCommentData;
    return [{ ref: artifact.id, kind: "comment", body: `${comment.lines.path}:${comment.lines.start}-${comment.lines.end}\n${comment.body}` }];
  }
  if (artifact.type === "ReviewDraft") {
    const draft = artifact.data as ReviewDraftData;
    return [{ ref: artifact.id, kind: "review-draft", body: `D${draft.revision}\n${draft.body}` }];
  }
  return [];
};

const render: ArtifactKind["render"] = (view, artifact, subId, _renderRef) => {
  if (artifact.type === "PhabComment" && subId === undefined) {
    const comments = phabThread(view.artifacts, artifact.id);
    if (!comments.length) return null;
    const root = comments[0]!.data;
    const location = root.path ? `Location: ${root.path}:${root.line} (${root.isNewFile ? "new" : "old"} side, diff ${root.diffId})` : "Location: general comment";
    return [`# Phabricator comment by @${root.author} on D${root.revision}`, location, `Done: ${root.done ? "yes" : "no"}`, root.body, ...comments.slice(1).map((item) => `Reply by @${item.data.author}: ${item.data.body}`)].join("\n\n");
  }
  if (artifact.type === "PatchNarrative") {
    const n = artifact.data as PatchNarrativeData;
    if (subId === undefined) return "# Summary\n" + n.summary + "\n\n# Changes\n" + n.changes.map((change) => "- " + artifact.id + "#" + change.id + ": " + change.title).join("\n");
    const commit = /^commit-(\d+)$/.exec(subId);
    const diffArtifact = view.artifacts.find((item) => item.id === n.diffId && item.type === "Diff");
    const diff = diffArtifact?.data as DiffData | undefined;
    if (commit) {
      const index = Number(commit[1]), item = diff?.commits[index];
      if (!item) return null;
      const files = diff!.files.filter((file) => file.hunks.some((hunk) => hunk.lines.some((line) => line.commit === index)));
      return [`# Commit ${index + 1} of ${diff!.commits.length}`, `Commit: ${item.sha.slice(0, 12)}`, `Subject: ${item.subject}`, ...(item.body ? [`Body:\n${item.body}`] : []), "# Changed files", ...(files.length ? files.map((file) => `- ${file.path} (${file.status})`) : ["None"])].join("\n\n");
    }
    const change = n.changes.find((item) => item.id === subId);
    if (!change) return null;
    const hunks = diff ? diff.files.flatMap((file) => file.hunks.filter((hunk) => change.hunkIds.includes(hunk.id)).map((hunk) => renderHunk(file, hunk))) : [];
    const specs = linkedSpecs(view, artifact.id, change.id).map((item) => { const data = item.data as SpecReferenceData; return "## Spec " + item.id + "\n" + (data.resolved?.title ?? data.url); });
    return ["# " + change.title, change.explanation, "## Rationale\n" + change.rationale, "## Depends on\n" + (change.dependsOn.join(", ") || "None"), ...hunks, ...specs].join("\n\n");
  }
  if (artifact.type === "Diff") {
    const diff = artifact.data as DiffData;
    if (subId === undefined) return "# Commits\n" + diff.commits.map((commit) => "- " + commit.subject + (commit.body ? "\n  " + commit.body : "")).join("\n") + "\n\n# Files\n" + diff.files.map((file) => "- " + file.path + " (" + file.status + ")").join("\n");
    const found = diff.files.flatMap((file) => file.hunks.filter((hunk) => hunk.id === subId).map((hunk) => ({ file, hunk })))[0];
    if (!found) return null;
    const narrative = [...view.artifacts].reverse().find((item) => item.type === "PatchNarrative" && (item.data as PatchNarrativeData).diffId === artifact.id);
    const changes = narrative ? (narrative.data as PatchNarrativeData).changes.filter((change) => change.hunkIds.includes(subId)).map((change) => "## " + change.title + "\n" + change.explanation) : [];
    return [renderHunk(found.file, found.hunk), ...changes].join("\n\n");
  }
  if (artifact.type === "ReviewFinding" && subId === undefined) {
    const data = artifact.data as ReviewFindingData;
    return ["# Finding " + artifact.id + ": " + data.title, "Category: " + data.category + ", severity: " + data.severity, "Anchor: " + data.anchor, ...(data.quote ? ["> " + data.quote] : []), data.body].join("\n\n");
  }
  if (artifact.type === "UserComment" && subId === undefined) {
    const data = artifact.data as UserCommentData;
    return `# User comment on ${data.diffId}\n\n${data.lines.path}:${data.lines.start}-${data.lines.end} (${data.lines.side})\n\n${data.deleted ? "Deleted" : data.body}`;
  }
  if (artifact.type === "ReviewDraft" && subId === undefined) {
    const data = artifact.data as ReviewDraftData;
    return `# Review draft for D${data.revision}\n\n${data.body}`;
  }
  return null;
};

export const artifactKinds: Record<string, ArtifactKind> = Object.fromEntries(["Diff", "PatchNarrative", "ReviewFinding", "PhabComment", "UserComment", "ReviewDraft"].map((type) => [type, { search, render }]));
export const searchKinds: string[] = ["change", "summary", "hunk", "commit", "finding", "comment", "review-draft"];

/** Review sections used in the session overview. */
export function reviewOverview(view: SessionView): string[] {
  const diffs = view.artifacts.filter((a) => a.type === "Diff");
  const diffArtifact = diffs.at(-1);
  const narrativeArtifact = diffArtifact && [...view.artifacts].reverse().find((a) => a.type === "PatchNarrative" && (a.data as PatchNarrativeData).diffId === diffArtifact.id);
  if (!diffArtifact || !narrativeArtifact) return ["No narrative yet."];
  const diff = diffArtifact.data as DiffData, narrative = narrativeArtifact.data as PatchNarrativeData;
  const changes = narrative.changes.map((change) => `- ${narrativeArtifact.id}#${change.id}: ${change.title} (hunks: ${change.hunkIds.join(", ") || "none"})`).join("\n") || "None";
  const currentChangeRefs = new Set(narrative.changes.map((change) => narrativeArtifact.id + "#" + change.id));
  const currentSpecIds = new Set(view.links.filter((link) => link.kind === "supports" && currentChangeRefs.has(link.to)).map((link) => link.from));
  const specs = view.artifacts.filter((a) => a.type === "SpecReference" && currentSpecIds.has(a.id)).map((a) => { const d = a.data as SpecReferenceData; return `- ${a.id}: ${d.resolved?.title ?? d.url} (${d.origin ?? "unknown"})`; }).join("\n") || "None";
  const findings = findingStates(view, narrativeArtifact.id).map((state) => `- ${state.finding.id} [${state.finding.data.severity} ${state.finding.data.category}] ${state.finding.data.title} (${state.outdated ? "location outdated" : state.anchor})`).join("\n") || "None";
  const remote = latestPhabComments(view.artifacts).filter((a) => !a.data.replyTo).map((a) => { const d = a.data, loc = d.path ? `${d.path}:${d.line}` : "general", body = d.body.split(/\r?\n/, 1)[0]!.slice(0, 80); return `- ${a.id} @${d.author} (${loc})${d.done ? ", done" : ""} : ${body}`; });
  return ["# Summary\n" + narrative.summary, "# Commits\n" + diff.commits.map((c) => "- " + c.subject + (c.body ? "\n  " + c.body : "")).join("\n"), "# Changes\n" + changes, "# Specs\n" + specs, "# Findings\n" + findings, ...(remote.length ? ["# Remote comments\n" + remote.join("\n")] : [])];
}
