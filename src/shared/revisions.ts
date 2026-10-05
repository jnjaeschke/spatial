import type { Artifact, Id, Link, RevisionData } from "./types.ts";

/** Locates `quote` in `text`, comparing with whitespace runs collapsed. */
export function findSpan(text: string, quote: string): { start: number; end: number } | { error: string } {
  const trimmed = quote.trim();
  if (!trimmed) return { error: "quote not found" };
  if (/\r|\n/.test(trimmed)) return { error: "quote spans lines" };
  if ([...trimmed].filter((c) => c === "`").length % 2) return { error: "quote splits inline code" };
  const words = trimmed.split(/\s+/);
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const match = new RegExp(escaped.join("\\s+")).exec(text);
  if (!match || match.index === undefined) return { error: "quote not found" };
  const start = match.index, end = start + match[0].length;
  let inFence = false;
  let offset = 0;
  for (const line of text.match(/.*(?:\n|$)/g) ?? []) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const lineEnd = offset + line.length;
    if (inFence && start < lineEnd && end > offset && !/^\s*```/.test(line)) return { error: "quote is inside a code block" };
    offset = lineEnd;
  }
  return { start, end };
}

/** Markdown of `text` with each revision's span replaced by strike-through and correction. */
export function applyRevisions(text: string, revisions: RevisionData[]): string {
  let result = text;
  for (const revision of revisions) {
    const span = findSpan(result, revision.quote);
    if ("error" in span) continue;
    result = result.slice(0, span.start) + `~~${result.slice(span.start, span.end)}~~ *(corrected: ${revision.correction})*` + result.slice(span.end);
  }
  return result;
}

/** Revisions of `messageId`, oldest first (artifact order). */
export function revisionsOf(s: { artifacts: Artifact[]; links: Link[] }, messageId: Id): Artifact<RevisionData>[] {
  const ids = new Set(s.links.filter((link) => link.kind === "revises" && link.to === messageId).map((link) => link.from));
  return s.artifacts.filter((artifact): artifact is Artifact<RevisionData> => artifact.type === "Revision" && ids.has(artifact.id));
}
