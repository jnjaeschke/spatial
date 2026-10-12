import type { CommandRunData } from "../shared/types.ts";
import { capOutput } from "./process.ts";

const MAX_OUTPUT = 262144;

/** A `CommandRun` record with the output capped at 256 KB. */
export function commandRunData(command: string, exitCode: number, durationMs: number, output: string, test: boolean): CommandRunData {
  return { command, exitCode, durationMs, output: capOutput(output, MAX_OUTPUT), test };
}
