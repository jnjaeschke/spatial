import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import { ClosedContext } from "../closed.ts";
import { AskContext } from "../chat-context.ts";
import type { NoteNodeData, ZoomLevel } from "../graph.ts";
import { AnswerMarkdown } from "../AnswerMarkdown.tsx";
import { Box } from "../Box.tsx";

type NoteFlowNode = Node<NoteNodeData & { level: ZoomLevel } & Record<string, unknown>, "note">;

export function NoteNode({ data, id }: NodeProps<NoteFlowNode>) {
  const closer = useContext(ClosedContext);
  const ask = useContext(AskContext);
  return <Box kind="note" level={data.level} testId={`note-${id}`} handles={{ source: Position.Left }} title={<>Note <span className="note-draft">Draft</span></>} actions={ask && <button aria-label="Ask about note" className="ask nodrag" onClick={() => ask.ask(id)}>Ask</button>} onClose={closer ? () => closer.close(id) : undefined}>
    <div className="body nodrag nopan nowheel"><AnswerMarkdown text={data.body} hunks={[]} diffId="" /></div>
  </Box>;
}
