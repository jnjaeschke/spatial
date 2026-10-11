import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import { Box, ClosedContext, ErrorText, IconButton, ReopenClosed, useAction } from "../../../web/plugin-api.ts";
import { SpecLinkContext, SpecMarkdown } from "./SpecMarkdown.tsx";
import type { AlgorithmNodeData } from "./graph.ts";
import { ExplorerContext } from "./context.ts";
import { EffectBadges } from "./EffectBadges.tsx";
import { ClauseText, SummaryBlock } from "./SummaryBlock.tsx";
import { GeckoStrip, GeckoStepLinks } from "./GeckoStrip.tsx";
import { engineActivity } from "../shared/engine.ts";

export type AlgorithmFlowNode = Node<Record<string, unknown> & AlgorithmNodeData, "spec-algorithm">;
const ORDERED_LIST = /^\s*\d+\. /m;

/** One algorithm box: its steps, with links that open the linked algorithm from the step they are in. */
export function AlgorithmNode({ id, data }: NodeProps<AlgorithmFlowNode>) {
  const explorer = useContext(ExplorerContext);
  const closer = useContext(ClosedContext);
  const algorithm = data.algorithm.data;
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const far = useStore((s) => s.transform[2] < 0.45);
  const summary = explorer?.summaries[algorithm.ref];
  const mapping = explorer?.mappings.gecko?.[algorithm.ref];
  const geckoActions = useMemo(() => explorer && !explorer.readOnly ? { find: (stale: string | null) => explorer.findInGecko(algorithm.ref, stale), decide: (key: string, decision: "confirm" | "reject") => explorer.decideGecko(algorithm.ref, key, decision) } : null, [explorer, algorithm.ref]);
  const links = useMemo(() => explorer && !explorer.readOnly ? { follow: (target: string, step: string | null) => explorer.open(target, { anchor: algorithm.ref, step: step ?? "" }) } : null, [explorer, algorithm.ref]);
  const stepExtras = useCallback((step: string) => <><GeckoStepLinks mapping={mapping} step={step} />{explorer && !explorer.readOnly && <AddToTrace onAdd={() => explorer.addToTrace(algorithm.ref, step)} step={step} />}<EffectBadges algorithm={algorithm} step={step} onShowPath={explorer && !explorer.readOnly ? (effectId) => explorer.showPath(algorithm.ref, effectId) : null} /></>, [algorithm, explorer, mapping]);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => { const root = container.current; if (!root) return; root.querySelector("li.step-focus")?.classList.remove("step-focus"); if (explorer?.focus?.anchor === algorithm.ref) root.querySelector(`li[data-step="${CSS.escape(explorer.focus.step)}"]`)?.classList.add("step-focus"); }, [explorer?.focus, algorithm.ref, algorithm.content]);
  useEffect(() => { const root = container.current; if (!root) return; root.querySelectorAll("li.step-highlight").forEach((li) => li.classList.remove("step-highlight")); for (const step of highlighted) root.querySelector(`li[data-step="${CSS.escape(step)}"]`)?.classList.add("step-highlight"); }, [highlighted]);
  return <Box kind="spec-algorithm" testId={`spec-box-${algorithm.ref}`} title={<><code className="spec-ref">{algorithm.ref}</code><span className="spec-title">{algorithm.title}</span></>} handles={{ target: Position.Left, source: Position.Right }} onClose={closer ? () => { closer.close(id); explorer?.reveal(data.reopenOn); } : undefined} closeLabel={`Close ${algorithm.ref}`}>
    <GeckoStrip mapping={mapping} activity={engineActivity(explorer?.tasks ?? [], data.algorithm.id, "gecko")} actions={geckoActions} />
    <SummaryBlock view={explorer?.summaries[algorithm.ref]} onHover={setHighlighted} onFlag={explorer && !explorer.readOnly ? () => explorer.flag(algorithm.ref) : null} />
    <SpecLinkContext.Provider value={links}><div ref={container} className={`spec-steps algorithm-steps nodrag nowheel${far && summary?.state === "ready" ? " far" : ""}`}><SpecMarkdown text={algorithm.content} steps={ORDERED_LIST.test(algorithm.content)} stepExtras={stepExtras} />{far && summary?.state === "ready" && <div className="spec-far-summary"><span className="badge">AI-written</span>{summary.clauses.map((clause, index) => <p key={index}><ClauseText text={clause.text} /></p>)}</div>}</div></SpecLinkContext.Provider>
    <ReopenClosed hostId={id} />
  </Box>;
}

function AddToTrace({ step, onAdd }: { step: string; onAdd(): Promise<void> }) { const action = useAction(); return <><IconButton label={`Add step ${step} to trace`} className="spec-add-trace nodrag" disabled={action.busy} onClick={() => void action.run(onAdd)}>+ trace</IconButton><ErrorText error={action.error} /></>; }
