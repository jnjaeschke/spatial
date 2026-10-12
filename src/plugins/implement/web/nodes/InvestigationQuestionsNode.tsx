import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { InvestigationQuestionsNodeData } from "../graph.ts";
import { InlineText, Box } from "../../../../web/plugin-api.ts";

export type InvestigationQuestionsFlowNode = Node<InvestigationQuestionsNodeData & Record<string, unknown>, "investigation-questions">;

export function InvestigationQuestionsNode({ data }: NodeProps<InvestigationQuestionsFlowNode>) {
  return <Box kind="investigation-questions" testId="investigation-questions" data={{ "data-anchor": `${data.investigationId}#questions` }} handles={{ target: Position.Top, source: Position.Bottom }} title="Open questions">
    <div className="body nodrag nopan"><ul>{data.questions.map((q, index) => <li key={index}><InlineText text={q} /></li>)}</ul></div>
  </Box>;
}
