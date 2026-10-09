import type { Artifact, ArtifactKind } from "../../../plugin-api.ts";
import type { CommentInterpretationData, CommentTriageData, CommandRunData, InvestigationData, InvestigationLocation } from "../shared/types.ts";

const renderLocation = (location: InvestigationLocation) => `${location.path}:${location.line} - ${location.why}\n\n\`${location.quote}\``;

/** Renders an investigation for chat context, including stable subrefs for its locations and plan steps. */
export function renderInvestigation(data: InvestigationData, subId?: string): string | null {
  if (subId !== undefined) {
    const location = /^loc(\d+)$/.exec(subId);
    if (location) return data.locations[Number(location[1])] ? renderLocation(data.locations[Number(location[1])]!) : null;
    const step = /^step(\d+)$/.exec(subId);
    if (step) {
      const item = data.steps[Number(step[1])];
      return item ? `${item.title}: ${item.message} - ${item.intent}${item.tests.length ? `\n\nTests: ${item.tests.join(", ")}` : ""}` : null;
    }
    return null;
  }
  return [
    `# Investigation (${data.kind})`, data.summary,
    ...(data.bug !== null ? [`Bug: ${data.bug}`] : []),
    "## Plan", ...data.steps.map((step, i) => `${i + 1}. ${step.title}: ${step.message} - ${step.intent}${step.tests.length ? `\n   Tests: ${step.tests.join(", ")}` : ""}`),
    "## Locations", ...data.locations.map(renderLocation),
    "## Test cases", ...data.testCases.map((item) => `- ${item.description}: expected ${item.expected}${item.actual ? `; actual ${item.actual}` : ""}${item.path ? ` (${item.path})` : ""}`),
    ...(data.architecture ? ["## Architecture", data.architecture] : []),
    "## Open questions", ...data.openQuestions.map((question) => `- ${question}`),
    "## What was tried", ...data.exploration.map((item) => `- ${item.tried} → ${item.outcome}`),
    ...(data.specRefs?.length ? ["## Specs", ...data.specRefs.map((ref) => ref.resolved ? `- ${ref.resolved.title} (${ref.url})` : `- ${ref.url} (unresolved: ${ref.reason})`)] : []),
    ...(data.diagram ? ["## Diagram", data.diagram.title, data.diagram.summary, ...data.diagram.steps.map((step) => `- ${step.from} → ${step.to}: ${step.call} (${step.what})${step.verified ? "" : " (unverified)"}`)] : []),
  ].join("\n\n");
}

export const artifactKinds: Record<string, ArtifactKind> = {
  Investigation: { render: (_view, artifact, subId) => renderInvestigation(artifact.data as InvestigationData, subId) },
  CommandRun: { render: (_view, artifact: Artifact, subId) => {
    if (subId !== undefined) return null;
    const d = artifact.data as CommandRunData;
    return `# Command run\n\n\`${d.command}\` exited ${d.exitCode} in ${d.durationMs} ms\n\n\`\`\`\n${d.output}\n\`\`\``;
  } },
  CommentInterpretation: { render: (_view, artifact) => { const d = artifact.data as CommentInterpretationData; return `# Interpretation of ${d.phid}\n\nAsks: ${d.asks}\n\nProposal: ${d.proposal}\n\nSuggested: ${d.action}${d.reply !== null ? `\n\nReply draft: ${d.reply}` : ""}`; } },
  CommentTriage: { render: (_view, artifact) => { const d = artifact.data as CommentTriageData; return `# Marked ${d.action}: ${d.phid}${d.text !== null ? `\n\n${d.text}` : ""}`; } },
};
