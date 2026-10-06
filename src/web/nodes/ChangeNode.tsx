import { useContext, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ChangeNodeData, ZoomLevel } from "../graph.ts";
import { DiffView } from "../DiffView.tsx";
import { InlineText } from "../InlineText.tsx";
import { AskContext } from "../chat-context.ts";
import { CollapseContext } from "../collapse.ts";
import { commitColors } from "../commit-colors.ts";
import { api } from "../api.ts";
import { ChatActionsContext } from "../chat-context.ts";

export type ChangeFlowNode = Node<ChangeNodeData & { sessionId: string; level: ZoomLevel } & Record<string, unknown>, "change">;

export function ChangeNode({ data }: NodeProps<ChangeFlowNode>) {
  const { change, level, files, hunks, sessionId, diffId } = data;
  const ask = useContext(AskContext);
  const actions = useContext(ChatActionsContext);
  const collapse = useContext(CollapseContext);
  const [error, setError] = useState<string | null>(null);
  const closed = collapse?.collapsed.has(`${data.narrativeId}#${change.id}`) ?? false;
  return (
    <div className={`node change-node level-${level}`} style={data.commit !== null ? { borderLeft: `4px solid ${commitColors(data.commit).swatch}` } : undefined} data-anchor={`${data.narrativeId}#${change.id}`} data-testid={`change-${change.id}`} data-level={level}>
      <Handle type="target" position={Position.Top} />
      <div className="title">{data.commit !== null && <span className="commit-tag">C{data.commit + 1}</span>}<InlineText text={change.title} />{change.status && <span className={`badge status-${change.status}`} data-testid="change-status">{change.status}</span>}<label className="reviewed nodrag"><input type="checkbox" aria-label={`Reviewed ${change.id}`} checked={data.reviewed} disabled={!actions} onChange={(event) => api.setReviewed(actions!.sessionId, data.narrativeId, change.id, event.currentTarget.checked).catch((e: Error) => setError(e.message))} /> Reviewed</label>{collapse && <button aria-label={closed ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(`${data.narrativeId}#${change.id}`)}>{closed ? "▸" : "▾"}</button>}{ask && level !== "patch" && <button aria-label={`Ask about ${change.id}`} className="ask nodrag" onClick={() => ask.ask(`${data.narrativeId}#${change.id}`)}>Ask</button>}</div>
      {error && <div className="failed">{error}</div>}
      {!closed && <div className="body nodrag nopan">
        {level !== "patch" && (
          <>
            <p className="explanation"><InlineText text={change.explanation} hunks={hunks} diffId={diffId} /></p>
            <p className="rationale"><b>Why:</b> <InlineText text={change.rationale} hunks={hunks} diffId={diffId} /></p>
          </>
        )}
        {level === "concept" && (
          <ul className="files">
            {files.map((f) => <li key={f}>{f}</li>)}
          </ul>
        )}
        {level === "code" && hunks.map(({ file, hunk }) => <DiffView key={hunk.id} sessionId={sessionId} diffId={diffId} file={file} hunk={hunk} />)}
      </div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
