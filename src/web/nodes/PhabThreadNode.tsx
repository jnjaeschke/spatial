import { useContext } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { PhabNodeData, ZoomLevel } from "../graph.ts";
import { AnswerMarkdown } from "../AnswerMarkdown.tsx";
import { Conversation } from "./ChatNode.tsx";
import { CollapseContext } from "../collapse.ts";

export type PhabFlowNode = Node<PhabNodeData & { level: ZoomLevel; sessionId: string } & Record<string, unknown>, "phab">;

export function PhabThreadNode({ data }: NodeProps<PhabFlowNode>) {
  const root = data.comments[0]!.data;
  const collapse = useContext(CollapseContext);
  const closed = data.done && (collapse?.collapsed.has(data.anchorId) ?? false);
  const lead = data.comments.map((item) => <div key={item.id} className="msg assistant phab-message"><strong>@{item.data.author}</strong><AnswerMarkdown text={item.data.body} hunks={data.hunks} diffId={data.diffId} /></div>);
  return <div className={`node phab-node${closed ? " collapsed" : ""}`} data-testid="phab-thread" data-anchor={data.anchorId}>
    <Handle type="source" position={Position.Left} />
    <div className="title"><span className="badge">Phabricator</span> @{root.author} · {data.path}:{data.line} ({data.side}) {data.done && <span className="badge phab-done">Done</span>} {data.fromEpoch !== null && <span className="epoch-marker" data-testid="phab-epoch">epoch {data.fromEpoch}</span>}{data.done && collapse && <button aria-label={closed ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(data.anchorId)}>{closed ? "▸" : "▾"}</button>}</div>
    {!closed && <Conversation anchor={data.anchorId} diffId={data.diffId} hunks={data.hunks} threadId={data.thread?.threadId ?? null} draftId={null} taskId={data.thread?.taskId ?? null} messages={data.thread?.messages ?? []} revisions={data.thread?.revisions ?? {}} mcpRequests={data.thread?.mcpRequests ?? []} lead={lead} />}
  </div>;
}
