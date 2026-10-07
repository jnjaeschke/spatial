import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { NoteNodeData, ZoomLevel } from "../graph.ts";
import { AnswerMarkdown } from "../AnswerMarkdown.tsx";

type NoteFlowNode = Node<NoteNodeData & { level: ZoomLevel } & Record<string, unknown>, "note">;

export function NoteNode({ data, id }: NodeProps<NoteFlowNode>) {
  return <div className={`node note-node level-${data.level}`} data-testid={`note-${id}`}>
    <Handle type="source" position={Position.Left} />
    <div className="title">Note <span className="note-draft">Draft</span></div>
    <div className="body nodrag nopan nowheel"><AnswerMarkdown text={data.body} hunks={[]} diffId="" /></div>
  </div>;
}
