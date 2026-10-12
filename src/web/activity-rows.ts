import type { LlmActivity } from "../shared/types.ts";

type Tool = Extract<LlmActivity, { kind: "tool" }>;
type ToolResult = Extract<LlmActivity, { kind: "tool-result" }>;
export type ActivityRow = Exclude<LlmActivity, Tool | ToolResult> | { kind: "tool"; call: Tool; result: ToolResult | null };

/** The rows of an activity log: a tool call and its result (paired by `callId`) are one row; a result without its call is dropped. */
export function activityRows(activity: LlmActivity[]): ActivityRow[] {
  const results = new Map(activity.flatMap((a) => a.kind === "tool-result" ? [[a.callId, a] as const] : []));
  return activity.flatMap((a): ActivityRow[] => a.kind === "tool-result" ? [] : a.kind === "tool" ? [{ kind: "tool", call: a, result: (a.callId && results.get(a.callId)) || null }] : [a]);
}
