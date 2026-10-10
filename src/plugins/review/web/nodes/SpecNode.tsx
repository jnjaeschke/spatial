import { useContext } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { SpecNodeData } from "../graph.ts";
import { Box } from "../../../../web/plugin-api.ts";
import { parseSteps, plainSpecText } from "../../shared/spec-text.ts";
import { SpecViewContext } from "../SpecView.tsx";

export type SpecFlowNode = Node<Record<string, unknown> & SpecNodeData, "spec">;

export function SpecNode({ data }: NodeProps<SpecFlowNode>) {
  const { ref } = data;
  const openSpecView = useContext(SpecViewContext);
  const r = ref.data.resolved;
  return (
    <Box kind="spec" testId={`spec-${ref.id}`} data={{ "data-anchor": ref.id }} handles={{ source: Position.Left }} title={<>{r ? `${r.spec}#${r.anchor}` : ref.data.url}{ref.status !== "verified" && <span className="badge unverified">unverified</span>}{ref.status === "verified" && ref.data.origin === "code" && <span className="badge cited">cited in code</span>}{ref.status === "verified" && ref.data.origin === "llm" && <span className="badge inferred">inferred</span>}</>} collapse={{ key: ref.id }}>
      <div className="body nodrag nopan">
        {r ? <p className="spec-text">{plainSpecText(r.content, 400)}</p> : <p className="failed">{ref.data.reason}</p>}
        <a href={r?.url ?? ref.data.url} target="_blank" rel="noreferrer">open spec</a>
        {r && openSpecView && parseSteps(r.content).length > 0 && <button className="steps" onClick={() => openSpecView(ref.id)}>Steps</button>}
        {ref.data.geckoRefs.length > 0 && <ul className="files">{ref.data.geckoRefs.map((g) => <li key={g.url}><a href={g.url} target="_blank" rel="noreferrer">{g.group}: {g.path}:{g.line}</a></li>)}</ul>}
        {ref.data.geckoRefsError && <p className="failed">Searchfox: {ref.data.geckoRefsError}</p>}
      </div>
    </Box>
  );
}
