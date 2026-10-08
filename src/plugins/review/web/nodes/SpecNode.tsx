import { useContext } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { type SpecNodeData, type ZoomLevel, CollapseContext } from "../../../../web/plugin-api.ts";
import { parseSteps, plainSpecText } from "../../shared/spec-text.ts";
import { SpecViewContext } from "../SpecView.tsx";

export type SpecFlowNode = Node<Record<string, unknown> & SpecNodeData & { level: ZoomLevel }, "spec">;

export function SpecNode({ data }: NodeProps<SpecFlowNode>) {
  const { ref, level } = data;
  const collapse = useContext(CollapseContext);
  const openSpecView = useContext(SpecViewContext);
  const closed = collapse?.collapsed.has(ref.id) ?? false;
  const r = ref.data.resolved;
  return (
    <div className={`node spec-node level-${level}`} data-anchor={ref.id} data-testid={`spec-${ref.id}`}>
      <Handle type="source" position={Position.Left} />
      <div className="title">{r ? `${r.spec}#${r.anchor}` : ref.data.url}{ref.status !== "verified" && <span className="badge unverified">unverified</span>}{ref.status === "verified" && ref.data.origin === "code" && <span className="badge cited">cited in code</span>}{ref.status === "verified" && ref.data.origin === "llm" && <span className="badge inferred">inferred</span>}{collapse && <button aria-label={closed ? "Expand" : "Collapse"} className="collapse nodrag" onClick={() => collapse.toggle(ref.id)}>{closed ? "▸" : "▾"}</button>}</div>
      {!closed && level !== "patch" && <div className="body nodrag nopan">
        {r ? <p className="spec-text">{plainSpecText(r.content, level === "code" ? 6000 : 400)}</p> : <p className="failed">{ref.data.reason}</p>}
        <a href={r?.url ?? ref.data.url} target="_blank" rel="noreferrer">open spec</a>
        {r && openSpecView && parseSteps(r.content).length > 0 && <button className="steps" onClick={() => openSpecView(ref.id)}>Steps</button>}
        {level === "code" && ref.data.geckoRefs.length > 0 && <ul className="files">{ref.data.geckoRefs.map((g) => <li key={g.url}><a href={g.url} target="_blank" rel="noreferrer">{g.group}: {g.path}:{g.line}</a></li>)}</ul>}
        {level === "code" && ref.data.geckoRefsError && <p className="failed">Searchfox: {ref.data.geckoRefsError}</p>}
      </div>}
    </div>
  );
}
