import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { SpecNodeData, ZoomLevel } from "../graph.ts";
import { plainSpecText } from "../spec-text.ts";

export type SpecFlowNode = Node<Record<string, unknown> & SpecNodeData & { level: ZoomLevel }, "spec">;

export function SpecNode({ data }: NodeProps<SpecFlowNode>) {
  const { ref, level } = data;
  const r = ref.data.resolved;
  return (
    <div className={`node spec-node level-${level}`} data-testid={`spec-${ref.id}`}>
      <Handle type="source" position={Position.Left} />
      <div className="title">{r ? `${r.spec}#${r.anchor}` : ref.data.url}{ref.status !== "verified" && <span className="badge unverified">unverified</span>}{ref.status === "verified" && ref.data.origin === "code" && <span className="badge cited">cited in code</span>}{ref.status === "verified" && ref.data.origin === "llm" && <span className="badge inferred">inferred</span>}</div>
      {level !== "patch" && <div className="body nodrag nopan">
        {r ? <p className="spec-text">{plainSpecText(r.content, level === "code" ? 6000 : 400)}</p> : <p className="failed">{ref.data.reason}</p>}
        <a href={r?.url ?? ref.data.url} target="_blank" rel="noreferrer">open spec</a>
        {level === "code" && ref.data.geckoRefs.length > 0 && <ul className="files">{ref.data.geckoRefs.map((g) => <li key={g.url}><a href={g.url} target="_blank" rel="noreferrer">{g.group}: {g.path}:{g.line}</a></li>)}</ul>}
        {level === "code" && ref.data.geckoRefsError && <p className="failed">Searchfox: {ref.data.geckoRefsError}</p>}
      </div>}
    </div>
  );
}
