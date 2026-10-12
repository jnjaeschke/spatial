import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { InvestigationNodeData } from "../graph.ts";
import { IconButton, AskContext, InlineText, Box, plural } from "../../../../web/plugin-api.ts";

export type InvestigationFlowNode = Node<InvestigationNodeData & Record<string, unknown>, "investigation">;

export function InvestigationNode({ data }: NodeProps<InvestigationFlowNode>) {
  const ask = useContext(AskContext);
  const d = data.data;
  return <Box kind="investigation" testId="investigation" data={{ "data-anchor": data.investigationId }} handles={{ target: Position.Top, source: Position.Bottom }} title={<>Investigation <span className="badge">{d.kind}</span>{d.bug !== null && <span className="badge">Bug {d.bug}</span>}</>} actions={ask && <IconButton label="Ask about the investigation" className="ask nodrag" onClick={() => ask.ask(data.investigationId)}>Ask</IconButton>}>
    <div className="body nodrag nopan">
      <p><InlineText text={d.summary} /></p>
      {d.architecture && <p className="architecture"><InlineText text={d.architecture} /></p>}
      <h4>Plan</h4>
      <ol className="plan">{d.steps.map((step, index) => <li key={index} data-testid={`investigation-step-${index}`} data-anchor={`${data.investigationId}#step${index}`}><b><InlineText text={step.title} /></b> <code>{step.message}</code><br /><InlineText text={step.intent} />{step.checks.length > 0 && <ul className="plan-checks">{step.checks.map((check, i) => <li key={i} data-testid="acceptance-check" data-kind={check.kind}><span className="badge">{check.kind}</span> <code>{check.kind === "measure" ? check.command : check.path}</code>{check.kind === "measure" && <> <InlineText text={check.goal} /></>}{check.kind === "failing-test" && check.subtests.length > 0 && <> ({check.subtests.join("; ")})</>}{check.kind === "failing-test" && check.baseEvidence && <span className="check-evidence" data-testid="check-evidence"> {check.baseEvidence}</span>}</li>)}</ul>}</li>)}</ol>
      {d.testCases.length > 0 && <><h4>Test cases</h4><ul>{d.testCases.map((t, index) => <li key={index}><InlineText text={t.description} /> — expected: {t.expected}{t.actual ? `, actual: ${t.actual}` : ""}{t.path ? ` (${t.path})` : ""}</li>)}</ul></>}
      {d.openQuestions.length > 0 && <><h4>Open questions</h4><ul>{d.openQuestions.map((q, index) => <li key={index}><InlineText text={q} /></li>)}</ul></>}
      {d.exploration.length > 0 && <details><summary>What was tried ({d.exploration.length})</summary><ul>{d.exploration.map((e, index) => <li key={index}><InlineText text={e.tried} /> → <InlineText text={e.outcome} /></li>)}</ul></details>}
      {d.specRefs && d.specRefs.length > 0 && <><h4>Specs</h4><ul>{d.specRefs.map((ref, index) => <li key={index}>{ref.resolved ? <a href={ref.resolved.url} target="_blank" rel="noreferrer" className="nodrag">{ref.resolved.title}</a> : <span title={ref.reason}>{ref.url} (unresolved)</span>}</li>)}</ul></>}
      {d.diagramError && <p className="dropped">Diagram dropped: {d.diagramError}</p>}
      {d.droppedLocations && d.droppedLocations.length > 0 && <p className="dropped" title={d.droppedLocations.join("\n")}>{plural(d.droppedLocations.length, "location")} dropped</p>}
      {d.droppedChecks && d.droppedChecks.length > 0 && <p className="dropped" data-testid="dropped-checks" title={d.droppedChecks.join("\n")}>{plural(d.droppedChecks.length, "check")} dropped</p>}
    </div>
  </Box>;
}
