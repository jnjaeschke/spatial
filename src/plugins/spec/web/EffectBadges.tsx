import { useState } from "react";
import { ErrorText, useAction } from "../../../web/plugin-api.ts";
import type { SpecAlgorithmData } from "../shared/types.ts";
import { effectLabel } from "../shared/effect-label.ts";

/** The effects of one step as badges, at most 3 and then "+N"; a badge opens its label, execution and location, and Show path. */
export function EffectBadges({ algorithm, step, onShowPath }: { algorithm: SpecAlgorithmData; step: string; onShowPath: ((effectId: string) => Promise<void>) | null }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const action = useAction();
  const items = (algorithm.stepEffects[step] ?? []).flatMap((item) => { const effect = algorithm.effects.find((candidate) => candidate.id === item.effectId); return effect ? [{ ...item, effect }] : []; });
  if (!items.length) return null;
  const selected = items.find((item) => item.effectId === open);
  return <div className="spec-effects nodrag">
    {(all ? items : items.slice(0, 3)).map(({ effectId, via, effect }) => <button key={effectId} type="button" className={`spec-effect via-${via}`} data-testid={`spec-effect-${effectId}`} aria-expanded={open === effectId} title={effectLabel(effect)} onClick={() => setOpen(open === effectId ? null : effectId)}>{effectLabel(effect)}</button>)}
    {!all && items.length > 3 && <button type="button" className="spec-effect more" onClick={() => setAll(true)}>+{items.length - 3}</button>}
    {selected && <div className="spec-effect-details" data-testid="spec-effect-details">
      <div>{effectLabel(selected.effect)}</div>
      <div>Execution: {selected.effect.execution.join(", ")}</div>
      {selected.effect.location && <div>Location: {selected.effect.location.spec}#{selected.effect.location.anchor}{selected.effect.location.step_path ? ` step ${selected.effect.location.step_path.join(".")}` : ""}</div>}
      <div>{selected.via === "direct" ? "At this step" : "Reached through a call in this step"}</div>
      {onShowPath && <button type="button" disabled={action.busy} onClick={() => void action.run(() => onShowPath(selected.effectId))}>Show path</button>}
      <ErrorText error={action.error} />
    </div>}
  </div>;
}
