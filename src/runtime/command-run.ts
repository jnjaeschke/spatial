import type { Artifact, CommandRunData } from "../shared/types.ts";
import type { ArtifactKind } from "./plugins.ts";
import type { TaskContext } from "./tasks.ts";
import { capOutput, runProcess } from "./process.ts";

type ProcessResult = Awaited<ReturnType<typeof runProcess>>;

const MAX_OUTPUT = 262144;

/** A `CommandRun` record with the output capped at 256 KB. */
export function commandRunData(command: string, exitCode: number, durationMs: number, output: string, test: boolean, callId?: string): CommandRunData {
  return { command, exitCode, durationMs, output: capOutput(output, MAX_OUTPUT), test, ...(callId ? { callId } : {}) };
}

/** Runs a command and records its result; callers retain their own progress and activity reporting. */
export async function runRecordedCommand(ctx: Pick<TaskContext, "repo" | "signal" | "artifacts">, options: {
  command: string; bin: string; args: string[]; test: boolean; callId?: string; env?: Record<string, string>;
  onStdoutLine?: (line: string) => void; onResult?: (result: ProcessResult, durationMs: number, output: string) => void;
}): Promise<{ result: ProcessResult; durationMs: number; output: string; artifact: Artifact<CommandRunData> }> {
  const started = Date.now();
  const result = await runProcess(options.bin, options.args, { stdin: "", cwd: ctx.repo, signal: ctx.signal,
    ...(options.env ? { env: options.env } : {}), ...(options.onStdoutLine ? { onStdoutLine: options.onStdoutLine } : {}) });
  const durationMs = Date.now() - started;
  const output = result.stderr ? `${result.stdout}\n${result.stderr}` : result.stdout;
  options.onResult?.(result, durationMs, output);
  const artifact = ctx.artifacts.put<CommandRunData>("CommandRun", "verified", commandRunData(options.command, result.code, durationMs, output, options.test, options.callId));
  return { result, durationMs, output, artifact };
}

export const commandRunKind: ArtifactKind = { render: (_view, artifact: Artifact, subId) => {
  if (subId !== undefined) return null;
  const d = artifact.data as CommandRunData;
  return `# Command run\n\n\`${d.command}\` exited ${d.exitCode} in ${d.durationMs} ms\n\n\`\`\`\n${d.output}\n\`\`\``;
} };
