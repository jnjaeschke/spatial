import type { ArtifactKind } from "../../../plugin-api.ts";
import type { TryProposalData, TryPushData } from "../shared/types.ts";

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
};
