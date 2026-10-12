import { useEffect, useState } from "react";
import type { UsageRun } from "../shared/types.ts";
import { api } from "./api.ts";
import { Dialog } from "./Dialog.tsx";
import { formatTokens, formatUsd, usageByDay, usageByModel, type ModelUsage } from "./usage.ts";

const REFRESH_MS = 60_000;
const DAYS = 30;
const color = (index: number) => `oklch(65% 0.15 ${(index * 137.5 + 260) % 360})`;

/** The topbar button with the overall LLM spend; it opens the spend per model and per day. */
export function UsageWidget() {
  const [runs, setRuns] = useState<UsageRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const load = () => api.usage().then((loaded) => { setRuns(loaded); setError(null); }, (e: Error) => setError(e.message));
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [open]);
  const total = runs?.reduce((sum, run) => sum + (run.costUsd ?? 0), 0) ?? 0;
  return <>
    <button type="button" className="usage-widget" data-testid="usage-widget" title={error ? `LLM spend unavailable: ${error}` : "LLM spend at API prices, all sessions"} onClick={() => setOpen(true)}>{runs ? formatUsd(total) : "$…"}</button>
    {open && runs && <UsageDialog runs={runs} onClose={() => setOpen(false)} />}
  </>;
}

function UsageDialog({ runs, onClose }: { runs: UsageRun[]; onClose(): void }) {
  const models = usageByModel(runs);
  const colors = new Map(models.map((model, i) => [model.key, color(i)]));
  const total = models.reduce((sum, model) => sum + model.costUsd, 0);
  const unpriced = models.reduce((sum, model) => sum + model.unpricedRuns, 0);
  return <Dialog title={<>LLM spend · {formatUsd(total)}</>} className="usage-dialog" testId="usage-dialog" onClose={onClose} footer={<button type="button" onClick={onClose}>Close</button>}>
    <div className="usage-models">
      <UsagePie models={models} colors={colors} />
      <table className="usage-table">
        <thead><tr><th>Model</th><th>Runs</th><th title="Input tokens, cached ones included">Input</th><th>Cached</th><th>Output</th><th>Cost</th></tr></thead>
        <tbody>{models.map((model) => <tr key={model.key}>
          <td><span className="usage-swatch" style={{ background: colors.get(model.key) }} />{model.key}</td>
          <td>{model.runs}</td><td>{formatTokens(model.inputTokens)}</td><td>{formatTokens(model.cachedInputTokens)}</td><td>{formatTokens(model.outputTokens)}</td>
          <td title={model.unpricedRuns ? `${model.unpricedRuns} runs without a known cost are not included` : undefined}>{formatUsd(model.costUsd)}{model.unpricedRuns > 0 && "*"}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <h3>Last {DAYS} days</h3>
    <UsageBars days={usageByDay(runs, DAYS, new Date())} colors={colors} />
    <p className="usage-note">Claude costs are what the claude CLI reports; codex costs are its tokens at list prices.{unpriced > 0 && ` * ${unpriced} runs have no known cost: an unpriced model, or recorded before tokens were metered.`}</p>
  </Dialog>;
}

function UsagePie({ models, colors }: { models: ModelUsage[]; colors: Map<string, string> }) {
  const priced = models.filter((model) => model.costUsd > 0);
  const total = priced.reduce((sum, model) => sum + model.costUsd, 0);
  if (total === 0) return <svg className="usage-pie" viewBox="-1 -1 2 2" aria-hidden="true"><circle r="1" fill="var(--surface-2)" /></svg>;
  let angle = -Math.PI / 2;
  return <svg className="usage-pie" viewBox="-1 -1 2 2" role="img" aria-label="Spend per model">
    {priced.map((model) => {
      const share = model.costUsd / total;
      const title = <title>{`${model.key}: ${formatUsd(model.costUsd)} (${Math.round(share * 100)}%)`}</title>;
      if (share > 0.9999) return <circle key={model.key} r="1" fill={colors.get(model.key)}>{title}</circle>;
      const from = angle;
      angle += share * 2 * Math.PI;
      const d = `M0 0 L${Math.cos(from)} ${Math.sin(from)} A1 1 0 ${share > 0.5 ? 1 : 0} 1 ${Math.cos(angle)} ${Math.sin(angle)} Z`;
      return <path key={model.key} d={d} fill={colors.get(model.key)}>{title}</path>;
    })}
  </svg>;
}

function UsageBars({ days, colors }: { days: ReturnType<typeof usageByDay>; colors: Map<string, string> }) {
  const dayTotal = (costs: Map<string, number>) => [...costs.values()].reduce((sum, usd) => sum + usd, 0);
  const max = Math.max(...days.map(({ costUsd }) => dayTotal(costUsd)));
  return <div className="usage-bars" role="img" aria-label="Spend per day">
    {days.map(({ day, costUsd }) => <div key={day} className="usage-bar" title={`${day}: ${formatUsd(dayTotal(costUsd))}${[...costUsd].map(([key, usd]) => `\n${key}: ${formatUsd(usd)}`).join("")}`}>
      {max > 0 && [...costUsd].map(([key, usd]) => <span key={key} style={{ height: `${(usd / max) * 100}%`, background: colors.get(key) }} />)}
    </div>)}
    <span className="usage-axis"><span>{days[0]?.day}</span><span>today · max {formatUsd(max)}</span></span>
  </div>;
}
