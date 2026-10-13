import { Canvas, conversationGraph, type CanvasModel, type PhaseViewProps } from "../../../web/plugin-api.ts";

const chatCanvas: CanvasModel = { graph: conversationGraph };

export function ChatView({ state, models, drafts, readOnly = false, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  return <Canvas model={chatCanvas} state={state} models={models} readOnly={readOnly} drafts={drafts} onSent={onSent} onDiscard={onDiscard} onOpenAside={onOpenAside} />;
}
