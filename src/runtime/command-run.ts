import type { Artifact, CommandRunData } from "../shared/types.ts";
import type { ArtifactKind } from "./plugins.ts";
import { capOutput } from "./process.ts";

const MAX_OUTPUT = 262144;

/** A `CommandRun` record with the output capped at 256 KB. */
export function commandRunData(command: string, exitCode: number, durationMs: number, output: string, test: boolean, callId?: string): CommandRunData {
  return { command, exitCode, durationMs, output: capOutput(output, MAX_OUTPUT), test, ...(callId ? { callId } : {}) };
}

export const commandRunKind: ArtifactKind = { render: (_view, artifact: Artifact, subId) => {
  if (subId !== undefined) return null;
  const d = artifact.data as CommandRunData;
  return `# Command run\n\n\`${d.command}\` exited ${d.exitCode} in ${d.durationMs} ms\n\n\`\`\`\n${d.output}\n\`\`\``;
} };
