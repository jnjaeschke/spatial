import { IconButton } from "../IconButton.tsx";
import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import { ClosedContext } from "../closed.ts";
import { AskContext } from "../chat-context.ts";
import type { NoteNodeData } from "../graph.ts";
import { AnswerMarkdown } from "../AnswerMarkdown.tsx";
import { Box } from "../Box.tsx";

type NoteFlowNode = Node<NoteNodeData & Record<string, unknown>, "note">;

export function NoteNode({ data, id }: NodeProps<NoteFlowNode>) {
  const closer = useContext(ClosedContext);
  const ask = useContext(AskContext);
  return <Box kind="note" testId={`note-${id}`} handles={{ source: Position.Left }} title={<>Note <span className="note-draft">Draft</span></>} actions={ask && <IconButton label="Ask about note" className="ask nodrag" onClick={() => ask.ask(id)}>Ask</IconButton>} onClose={closer ? () => closer.close(id) : undefined}>
    <div className="body nodrag nopan"><AnswerMarkdown text={data.body} hunks={[]} diffId="" /></div>
  </Box>;
}
