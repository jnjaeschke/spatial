import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ChangeNodeData, ZoomLevel } from "../graph.ts";
import { DiffView } from "../DiffView.tsx";
import { InlineText } from "../InlineText.tsx";

export type ChangeFlowNode = Node<ChangeNodeData & { sessionId: string; level: ZoomLevel } & Record<string, unknown>, "change">;

export function ChangeNode({ data }: NodeProps<ChangeFlowNode>) {
  const { change, level, files, hunks, sessionId, diffId } = data;
  return (
    <div className={`node change-node level-${level}`} data-testid={`change-${change.id}`} data-level={level}>
      <Handle type="target" position={Position.Top} />
      <div className="title"><InlineText text={change.title} /></div>
      <div className="body nodrag nopan">
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
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
