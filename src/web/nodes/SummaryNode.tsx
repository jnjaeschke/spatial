import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { SummaryNodeData, ZoomLevel } from "../graph.ts";
import { InlineText } from "../InlineText.tsx";

export type SummaryFlowNode = Node<SummaryNodeData & { level: ZoomLevel } & Record<string, unknown>, "summary">;

export function SummaryNode({ data }: NodeProps<SummaryFlowNode>) {
  const specStatus = data.specStatus;
  const specText = specStatus && (
    specStatus.code + specStatus.inferred + specStatus.unverified === 0
      ? "No spec references in or near this patch"
      : `Specs: ${[
        specStatus.code > 0 && `${specStatus.code} cited in code`,
        specStatus.inferred > 0 && `${specStatus.inferred} inferred`,
        specStatus.unverified > 0 && `${specStatus.unverified} unverified`,
      ].filter(Boolean).join(", ")}`
  );
  return (
    <div className={`node summary-node level-${data.level}`} data-anchor={data.narrativeId} data-testid="summary">
      <div className="title">{data.changeCount} changes</div>
      <div className="body nodrag nopan">
        <p><InlineText text={data.summary} /></p>
        {data.level !== "patch" && specText && <p className="spec-status">{specText}</p>}
        {data.level !== "patch" && (
          <ul className="files">
            {data.commits.map((c) => <li key={c.sha}>{c.subject}</li>)}
          </ul>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
