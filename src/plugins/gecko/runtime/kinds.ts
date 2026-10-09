import type { ArtifactKind } from "../../../plugin-api.ts";
import type { TryProposalData, TryPushData, TryRunData } from "../shared/types.ts";

export const artifactKinds: Record<string, ArtifactKind> = {
  TryProposal: { render: (_view, artifact, subId) => {
    if (subId !== undefined) return null;
    const d = artifact.data as TryProposalData;
    return `# Try proposal\n\n\`${d.command}\`\n\n${d.reason}`;
  } },
  TryPush: { render: (_view, artifact, subId) => {
    if (subId !== undefined) return null;
    const d = artifact.data as TryPushData;
    return `# Try push\n\n\`${d.command}\` at ${d.head.slice(0, 12)}\n\n${d.url}`;
  } },
  TryRun: { render: (_view, artifact, subId) => {
    if (subId !== undefined) return null;
    const d = artifact.data as TryRunData;
    const counts = Object.entries(d.counts).map(([state, count]) => `${state}: ${count}`).join(", ") || "status unavailable";
    const lines = d.failures.map((failure) => `- ${failure.name} (${failure.platform}, ${failure.result}): ${failure.errors.map((error) => error.message).join("; ")}`);
    return [`# Try run${d.complete ? " (complete)" : ""}`, counts, d.error ? `Error: ${d.error}` : "", ...lines].filter(Boolean).join("\n\n");
  } },
};
