import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { PhabNodeData } from "../graph.ts";
import { type ZoomLevel, Conversation, Box } from "../../../../web/plugin-api.ts";
import { PhabComment } from "../PhabComment.tsx";

export type PhabFlowNode = Node<PhabNodeData & { level: ZoomLevel; sessionId: string } & Record<string, unknown>, "phab">;

export function PhabThreadNode({ data }: NodeProps<PhabFlowNode>) {
  const root = data.comments[0]!.data;
  const lead = data.comments.map((item) => <div key={item.id} className="msg assistant phab-message"><PhabComment comment={item} anchorId={data.phabAnchors[item.data.phid]!} hunks={data.hunks} diffId={data.diffId} /></div>);
  return <Box kind="phab" testId="phab-thread" data={{ "data-anchor": data.anchorId }} handles={{ source: Position.Left }} title={<><span className="badge">Phabricator</span> @{root.author} · {data.path}:{data.line} ({data.side}) {data.done && <span className="badge phab-done">Done</span>} {data.fromEpoch !== null && <span className="epoch-marker" data-testid="phab-epoch">epoch {data.fromEpoch}</span>}</>} collapse={data.done ? { key: data.anchorId } : undefined}>
    <Conversation anchor={data.anchorId} diffId={data.diffId} hunks={data.hunks} threadId={data.thread?.threadId ?? null} draftId={null} taskId={data.thread?.taskId ?? null} messages={data.thread?.messages ?? []} revisions={data.thread?.revisions ?? {}} mcpRequests={data.thread?.mcpRequests ?? []} lead={lead} />
  </Box>;
}
