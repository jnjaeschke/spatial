import { useContext } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { ClosedContext } from "../closed.ts";
import { AskContext } from "../chat-context.ts";
import type { NoteNodeData, ZoomLevel } from "../graph.ts";
import { AnswerMarkdown } from "../AnswerMarkdown.tsx";

type NoteFlowNode = Node<NoteNodeData & { level: ZoomLevel } & Record<string, unknown>, "note">;

export function NoteNode({ data, id }: NodeProps<NoteFlowNode>) {
  const closer = useContext(ClosedContext);
  const ask = useContext(AskContext);
  return <div className={`node note-node level-${data.level}`} data-testid={`note-${id}`}>
    <Handle type="source" position={Position.Left} />
    <div className="title">Note <span className="note-draft">Draft</span>{ask && <button aria-label="Ask about note" className="ask nodrag" onClick={() => ask.ask(id)}>Ask</button>}{closer && <button aria-label="Close" className="close nodrag" onClick={() => closer.close(id)}>✕</button>}</div>
    <div className="body nodrag nopan nowheel"><AnswerMarkdown text={data.body} hunks={[]} diffId="" /></div>
  </div>;
}
