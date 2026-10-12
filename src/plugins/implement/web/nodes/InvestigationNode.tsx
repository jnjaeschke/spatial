import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { InvestigationNodeData } from "../graph.ts";
import { IconButton, AskContext, InlineText, Box, plural } from "../../../../web/plugin-api.ts";
import { Clamped } from "./Clamped.tsx";

export type InvestigationFlowNode = Node<InvestigationNodeData & Record<string, unknown>, "investigation">;

export function InvestigationNode({ data }: NodeProps<InvestigationFlowNode>) {
  const ask = useContext(AskContext);
  const d = data.data;
  const hasDetails = d.architecture || d.exploration.length > 0 || d.specRefs?.length || d.diagramError || d.droppedLocations?.length || d.droppedChecks?.length;
  return <Box kind="investigation" testId="investigation" data={{ "data-anchor": data.investigationId }} handles={{ target: Position.Top, source: Position.Bottom }} title={<>Investigation <span className="badge">{d.kind}</span>{d.bug !== null && <span className="badge">Bug {d.bug}</span>}</>} actions={ask && <IconButton label="Ask about the investigation" className="ask nodrag" onClick={() => ask.ask(data.investigationId)}>Ask</IconButton>}>
    <div className="body nodrag nopan">
      <Clamped text={d.summary} />
      {hasDetails && <details className="investigation-details"><summary>Details</summary>
        {d.architecture && <p className="architecture"><InlineText text={d.architecture} /></p>}
        {d.exploration.length > 0 && <><h4>What was tried ({d.exploration.length})</h4><ul>{d.exploration.map((e, index) => <li key={index}><InlineText text={e.tried} /> → <InlineText text={e.outcome} /></li>)}</ul></>}
        {d.specRefs && d.specRefs.length > 0 && <><h4>Specs</h4><ul>{d.specRefs.map((ref, index) => <li key={index}>{ref.resolved ? <a href={ref.resolved.url} target="_blank" rel="noreferrer" className="nodrag">{ref.resolved.title}</a> : <span title={ref.reason}>{ref.url} (unresolved)</span>}</li>)}</ul></>}
        {d.diagramError && <p className="dropped">Diagram dropped: {d.diagramError}</p>}
        {d.droppedLocations && d.droppedLocations.length > 0 && <p className="dropped" title={d.droppedLocations.join("\n")}>{plural(d.droppedLocations.length, "location")} dropped</p>}
        {d.droppedChecks && d.droppedChecks.length > 0 && <p className="dropped" data-testid="dropped-checks" title={d.droppedChecks.join("\n")}>{plural(d.droppedChecks.length, "check")} dropped</p>}
      </details>}
    </div>
  </Box>;
}
