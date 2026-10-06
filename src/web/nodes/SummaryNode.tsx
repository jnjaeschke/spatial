import { useContext, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { SummaryNodeData, ZoomLevel } from "../graph.ts";
import { InlineText } from "../InlineText.tsx";
import { CollapseContext } from "../collapse.ts";
import { api } from "../api.ts";

export type SummaryFlowNode = Node<SummaryNodeData & { level: ZoomLevel } & Record<string, unknown>, "summary">;

export function SummaryNode({ data }: NodeProps<SummaryFlowNode>) {
  const [postResult, setPostResult] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const collapse = useContext(CollapseContext);
  const closed = collapse?.collapsed.has(data.narrativeId) ?? false;
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
  const revNum = data.revision?.id;
  return (
    <div className={`node summary-node level-${data.level}`} data-anchor={data.narrativeId} data-testid="summary">
      <div className="title">{data.changeCount} changes{collapse && <button aria-label={closed ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(data.narrativeId)}>{closed ? "▸" : "▾"}</button>}</div>
      {data.sinceEpoch !== null && <div className="since-epoch" data-testid="since-epoch">Changes since epoch {data.sinceEpoch}</div>}
      {!closed && <div className="body nodrag nopan">
        <p><InlineText text={data.summary} /></p>
        {data.level !== "patch" && specText && <p className="spec-status">{specText}</p>}
        {data.level !== "patch" && data.pendingComments > 0 && revNum && <div className="post-drafts-row">
          <button className="post-drafts nodrag" onClick={async () => {
            setPostError(null);
            setPostResult(null);
            try {
              const result = await api.postDrafts(data.sessionId);
              const skipped = result.skipped.map((item) => `${item.finding}: ${item.reason}`).join("; ");
              setPostResult(`Posted ${result.posted} draft${result.posted !== 1 ? "s" : ""} to ${result.revision}${skipped ? `; skipped ${skipped}` : ""}`);
            } catch (e) { setPostError((e as Error).message); }
          }}>Post {data.pendingComments} draft{data.pendingComments !== 1 ? "s" : ""} to D{revNum}</button>
          {postResult && <span className="post-result">{postResult}</span>}
          {postError && <span className="post-error">{postError}</span>}
        </div>}
        {data.level !== "patch" && (
          <ul className="files">
            {data.commits.map((c) => <li key={c.sha}>{c.subject}</li>)}
          </ul>
        )}
      </div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
