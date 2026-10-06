import type { WorkflowInfo } from "../shared/types.ts";

/** Commands to offer while `text` is `/` plus a partial name without whitespace: those whose id starts with it, registry order. Otherwise none. */
export function commandSuggestions(text: string, commands: WorkflowInfo[]): WorkflowInfo[] {
  const m = /^\/(\S*)$/.exec(text);
  return m ? commands.filter((c) => c.id.startsWith(m[1]!)) : [];
}

export const completeCommand = (command: WorkflowInfo): string => `/${command.id} `;
