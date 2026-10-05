import { useContext } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AskContext } from "../chat-context.ts";
import { CollapseContext } from "../collapse.ts";
import type { FindingNodeData, ZoomLevel } from "../graph.ts";
import { AnswerMarkdown } from "../AnswerMarkdown.tsx";

export type FindingFlowNode = Node<FindingNodeData & { level: ZoomLevel } & Record<string, unknown>, "finding">;

export function FindingNode({ data }: NodeProps<FindingFlowNode>) {
  const ask = useContext(AskContext);
  const collapse = useContext(CollapseContext);
  const closed = collapse?.collapsed.has(data.findingId) ?? false;
  return <div className={`node finding-node severity-${data.severity} level-${data.level}`} data-testid={`finding-${data.findingId}`} data-anchor={data.findingId}>
    <Handle type="source" position={Position.Left} />
    <div className="title"><span className={`badge severity-${data.severity}`}>{data.severity}</span><span className="category">{data.category}</span>{data.title}{collapse && <button aria-label={closed ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(data.findingId)}>{closed ? "▸" : "▾"}</button>}{ask && data.level !== "patch" && <button aria-label="Ask about finding" className="ask nodrag" onClick={() => ask.ask(data.findingId)}>Ask</button>}</div>
    {!closed && data.level !== "patch" && <div className="body nodrag nopan nowheel"><AnswerMarkdown text={data.body} hunks={data.hunks} diffId={data.diffId} /></div>}
  </div>;
}
