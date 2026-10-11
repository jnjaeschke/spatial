import { useContext, useMemo } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import { Box, ClosedContext, ReopenClosed } from "../../../web/plugin-api.ts";
import { SpecLinkContext, SpecMarkdown } from "./SpecMarkdown.tsx";
import type { AlgorithmNodeData } from "./graph.ts";
import { ExplorerContext } from "./context.ts";

export type AlgorithmFlowNode = Node<Record<string, unknown> & AlgorithmNodeData, "spec-algorithm">;
const ORDERED_LIST = /^\s*\d+\. /m;

/** One algorithm box: its steps, with links that open the linked algorithm from the step they are in. */
export function AlgorithmNode({ id, data }: NodeProps<AlgorithmFlowNode>) {
  const explorer = useContext(ExplorerContext);
  const closer = useContext(ClosedContext);
  const algorithm = data.algorithm.data;
  const links = useMemo(() => explorer && !explorer.readOnly ? { follow: (target: string, step: string | null) => explorer.open(target, { anchor: algorithm.ref, step: step ?? "" }) } : null, [explorer, algorithm.ref]);
  return <Box kind="spec-algorithm" testId={`spec-box-${algorithm.ref}`} title={<><code className="spec-ref">{algorithm.ref}</code><span className="spec-title">{algorithm.title}</span></>} handles={{ target: Position.Left, source: Position.Right }} onClose={closer ? () => { closer.close(id); explorer?.reveal(data.reopenOn); } : undefined} closeLabel={`Close ${algorithm.ref}`}>
    <SpecLinkContext.Provider value={links}><div className="spec-steps nodrag nowheel"><SpecMarkdown text={algorithm.content} steps={ORDERED_LIST.test(algorithm.content)} /></div></SpecLinkContext.Provider>
    <ReopenClosed hostId={id} />
  </Box>;
}
