import { Canvas, conversationGraph, type CanvasModel, type PhaseViewProps } from "../../../web/plugin-api.ts";

const chatCanvas: CanvasModel = { graph: conversationGraph };

export function ChatView({ state, models, drafts, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  return <Canvas model={chatCanvas} state={state} models={models} drafts={drafts} onSent={onSent} onDiscard={onDiscard} onOpenAside={onOpenAside} />;
}
