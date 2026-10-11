import { useContext, useMemo } from "react";
import { Canvas, useClosed, type CanvasModel, type CanvasProviderProps, type PhaseViewProps } from "../../../web/plugin-api.ts";
import type { SpecOpenedData } from "../shared/types.ts";
import { explorerGraph, explorerLayout, specNodeId } from "./graph.ts";
import { ExplorerContext, ExplorerViewContext } from "./context.ts";
import { specClient } from "./client.ts";

function ExplorerProvider({ graph, readOnly, reveal, children }: CanvasProviderProps) {
  const view = useContext(ExplorerViewContext)!;
  const value = useMemo(() => ({
    readOnly,
    reveal(nodeId: string) { reveal(nodeId, nodeId); },
    async open(target: string, from: SpecOpenedData["from"]) {
      const id = specNodeId(target);
      if (view.closed.closed.has(id)) view.closed.reopen([id]);
      await specClient.open(view.sessionId, target, from);
      if (graph.nodes.some((node) => node.id === id)) reveal(id, id);
    },
  }), [view, graph, readOnly, reveal]);
  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

/** The spec explorer: the phase view of `explore`, and a session view elsewhere. */
export function ExplorerView({ state, models, drafts, readOnly = false, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  const viewKey = `${state.session.id}:spec`;
  const closed = useClosed(viewKey);
  const model = useMemo<CanvasModel>(() => ({
    graph: (current, currentDrafts) => explorerGraph(current, currentDrafts, closed.closed, null),
    stack: { is: () => true, layout: explorerLayout },
    revealWhenAdded: (node) => node.data.kind === "spec-algorithm",
    Provider: ExplorerProvider,
  }), [closed.closed]);
  const view = useMemo(() => ({ sessionId: state.session.id, closed }), [state.session.id, closed]);
  return <ExplorerViewContext.Provider value={view}><Canvas state={state} model={model} closed={closed} viewKey={viewKey} models={readOnly ? null : models} drafts={drafts} onSent={onSent} onDiscard={onDiscard} onOpenAside={onOpenAside} /></ExplorerViewContext.Provider>;
}
