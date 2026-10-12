import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { InvestigationStepNodeData } from "../graph.ts";
import { IconButton, AskContext, InlineText, Box } from "../../../../web/plugin-api.ts";
import { Clamped } from "./Clamped.tsx";

export type InvestigationStepFlowNode = Node<InvestigationStepNodeData & Record<string, unknown>, "investigation-step">;

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export function InvestigationStepNode({ data }: NodeProps<InvestigationStepFlowNode>) {
  const ask = useContext(AskContext);
  const { step, index } = data;
  const anchor = `${data.investigationId}#step${index}`;
  return <Box kind="investigation-step" testId={`investigation-step-${index}`} data={{ "data-anchor": anchor }} handles={{ target: Position.Top, source: Position.Bottom }} title={<>Step {index + 1}: <InlineText text={step.title} /></>} actions={ask && <IconButton label={`Ask about step ${index + 1}`} className="ask nodrag" onClick={() => ask.ask(anchor)}>Ask</IconButton>}>
    <div className="body nodrag nopan">
      <code>{step.message}</code>
      <Clamped text={step.intent} />
      {step.checks.length > 0 && <ul className="plan-checks">{step.checks.map((check, i) => <li key={i} data-testid="acceptance-check" data-kind={check.kind} title={check.kind === "measure" ? `${check.command}\n${check.goal}` : check.path}>
        <span className="badge">{check.kind}</span> <code>{check.kind === "measure" ? check.command : basename(check.path)}</code>
        {check.kind === "failing-test" && check.subtests.length > 0 && <> ({check.subtests.join("; ")})</>}
        {check.kind === "failing-test" && check.baseEvidence && <span className="check-evidence" data-testid="check-evidence"> {check.baseEvidence}</span>}
      </li>)}</ul>}
    </div>
  </Box>;
}
