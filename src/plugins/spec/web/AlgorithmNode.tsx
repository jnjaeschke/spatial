import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import { Box, ClosedContext, ErrorText, IconButton, ReopenClosed, useAction } from "../../../web/plugin-api.ts";
import { SpecLinkContext, SpecMarkdown } from "./SpecMarkdown.tsx";
import type { AlgorithmNodeData } from "./graph.ts";
import { ExplorerContext } from "./context.ts";
import { EffectBadges } from "./EffectBadges.tsx";

export type AlgorithmFlowNode = Node<Record<string, unknown> & AlgorithmNodeData, "spec-algorithm">;
const ORDERED_LIST = /^\s*\d+\. /m;

/** One algorithm box: its steps, with links that open the linked algorithm from the step they are in. */
export function AlgorithmNode({ id, data }: NodeProps<AlgorithmFlowNode>) {
  const explorer = useContext(ExplorerContext);
  const closer = useContext(ClosedContext);
  const algorithm = data.algorithm.data;
  const links = useMemo(() => explorer && !explorer.readOnly ? { follow: (target: string, step: string | null) => explorer.open(target, { anchor: algorithm.ref, step: step ?? "" }) } : null, [explorer, algorithm.ref]);
  const stepExtras = useCallback((step: string) => <>{explorer && !explorer.readOnly && <AddToTrace onAdd={() => explorer.addToTrace(algorithm.ref, step)} step={step} />}<EffectBadges algorithm={algorithm} step={step} onShowPath={explorer && !explorer.readOnly ? (effectId) => explorer.showPath(algorithm.ref, effectId) : null} /></>, [algorithm, explorer]);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => { const root = container.current; if (!root) return; root.querySelector("li.step-focus")?.classList.remove("step-focus"); if (explorer?.focus?.anchor === algorithm.ref) root.querySelector(`li[data-step="${CSS.escape(explorer.focus.step)}"]`)?.classList.add("step-focus"); }, [explorer?.focus, algorithm.ref]);
  return <Box kind="spec-algorithm" testId={`spec-box-${algorithm.ref}`} title={<><code className="spec-ref">{algorithm.ref}</code><span className="spec-title">{algorithm.title}</span></>} handles={{ target: Position.Left, source: Position.Right }} onClose={closer ? () => { closer.close(id); explorer?.reveal(data.reopenOn); } : undefined} closeLabel={`Close ${algorithm.ref}`}>
    <SpecLinkContext.Provider value={links}><div ref={container} className="spec-steps nodrag nowheel"><SpecMarkdown text={algorithm.content} steps={ORDERED_LIST.test(algorithm.content)} stepExtras={stepExtras} /></div></SpecLinkContext.Provider>
    <ReopenClosed hostId={id} />
  </Box>;
}

function AddToTrace({ step, onAdd }: { step: string; onAdd(): Promise<void> }) { const action = useAction(); return <><IconButton label={`Add step ${step} to trace`} className="spec-add-trace nodrag" disabled={action.busy} onClick={() => void action.run(onAdd)}>+ trace</IconButton><ErrorText error={action.error} /></>; }
