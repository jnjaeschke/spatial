import { Canvas } from "../../../web/plugin-api.ts";
import type { PhaseViewProps } from "../../../web/plugin-api.ts";

export function ChatView({ state, models, drafts, onSent, onDiscard, onOpenAside }: PhaseViewProps) {
  return <Canvas state={state} models={models} drafts={drafts} onSent={onSent} onDiscard={onDiscard} onOpenAside={onOpenAside} />;
}
