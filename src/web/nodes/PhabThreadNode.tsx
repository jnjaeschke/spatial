import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { PhabNodeData, ZoomLevel } from "../graph.ts";
import { AnswerMarkdown } from "../AnswerMarkdown.tsx";
import { Conversation } from "./ChatNode.tsx";

export type PhabFlowNode = Node<PhabNodeData & { level: ZoomLevel; sessionId: string } & Record<string, unknown>, "phab">;

export function PhabThreadNode({ data }: NodeProps<PhabFlowNode>) {
  const root = data.comments[0]!.data;
  const lead = <div className="msg assistant"><AnswerMarkdown text={data.comments.map((item) => `@${item.data.author}: ${item.data.body}`).join("\n\n")} hunks={data.hunks} diffId={data.diffId} /></div>;
  return <div className="node finding-node" data-testid="phab-thread" data-anchor={data.anchorId}>
    <Handle type="source" position={Position.Left} />
    <div className="title"><span className="badge">Phabricator</span>@{root.author} · {data.path}:{data.line} ({data.side})</div>
    <Conversation anchor={data.anchorId} diffId={data.diffId} hunks={data.hunks} threadId={data.thread?.threadId ?? null} draftId={null} taskId={data.thread?.taskId ?? null} messages={data.thread?.messages ?? []} revisions={data.thread?.revisions ?? {}} mcpRequests={data.thread?.mcpRequests ?? []} lead={lead} />
  </div>;
}
