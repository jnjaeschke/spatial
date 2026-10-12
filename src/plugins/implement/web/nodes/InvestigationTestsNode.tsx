import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { InvestigationTestsNodeData } from "../graph.ts";
import { InlineText, Box } from "../../../../web/plugin-api.ts";

export type InvestigationTestsFlowNode = Node<InvestigationTestsNodeData & Record<string, unknown>, "investigation-tests">;

export function InvestigationTestsNode({ data }: NodeProps<InvestigationTestsFlowNode>) {
  const anchor = `${data.investigationId}#tests`;
  return <Box kind="investigation-tests" testId="investigation-tests" data={{ "data-anchor": anchor }} handles={{ target: Position.Top, source: Position.Bottom }} title={`Test cases (${data.testCases.length})`} collapse={{ key: anchor, label: "test cases" }}>
    <div className="body nodrag nopan"><ul>{data.testCases.map((t, index) => <li key={index}><InlineText text={t.description} /> — expected: {t.expected}{t.actual ? `, actual: ${t.actual}` : ""}{t.path ? ` (${t.path})` : ""}</li>)}</ul></div>
  </Box>;
}
