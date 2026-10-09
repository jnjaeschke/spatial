import type { ArtifactKind } from "../../../plugin-api.ts";
import type { TryProposalData } from "../shared/types.ts";

export const artifactKinds: Record<string, ArtifactKind> = {
  TryProposal: { render: (_view, artifact, subId) => {
    if (subId !== undefined) return null;
    const d = artifact.data as TryProposalData;
    return `# Try proposal\n\n\`${d.command}\`\n\n${d.reason}`;
  } },
};
