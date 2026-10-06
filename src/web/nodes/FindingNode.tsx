import { useContext } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { ChatActionsContext } from "../chat-context.ts";
import { CollapseContext } from "../collapse.ts";
import type { FindingNodeData, ZoomLevel } from "../graph.ts";
import { AnswerMarkdown } from "../AnswerMarkdown.tsx";
import { Conversation } from "./ChatNode.tsx";

export type FindingFlowNode = Node<FindingNodeData & { level: ZoomLevel } & Record<string, unknown>, "finding">;

export function FindingNode({ data }: NodeProps<FindingFlowNode>) {
  const actions = useContext(ChatActionsContext);
  const collapse = useContext(CollapseContext);
  const closed = collapse?.collapsed.has(data.findingId) ?? false;
  const finding = <div className="msg assistant finding-body"><AnswerMarkdown text={data.body} hunks={data.hunks} diffId={data.diffId} /></div>;
  return <div className={`node finding-node severity-${data.severity} level-${data.level}`} data-testid={`finding-${data.findingId}`} data-anchor={data.findingId}>
    <Handle type="source" position={Position.Left} />
    <div className="title"><span className={`badge severity-${data.severity}`}>{data.severity}</span><span className="category">{data.category}</span>{data.title}{data.thread && ` · ${data.thread.messages.length}`}{collapse && <button aria-label={closed ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(data.findingId)}>{closed ? "▸" : "▾"}</button>}</div>
    {!closed && data.level !== "patch" && (actions
      ? <Conversation anchor={data.findingId} diffId={data.diffId} hunks={data.hunks} threadId={data.thread?.threadId ?? null} draftId={null} taskId={data.thread?.taskId ?? null} messages={data.thread?.messages ?? []} revisions={data.thread?.revisions ?? {}} mcpRequests={data.thread?.mcpRequests ?? []} lead={finding} />
      : <div className="messages body nodrag nopan nowheel">{finding}</div>)}
  </div>;
}
