import { chipLabel, chipStatus, type CommandChip } from "./command-runs.ts";

/** The shell commands of an implement epoch as chips (tests are marked); clicking one opens its output in a terminal-style panel. */
export function CommandStrip({ chips, selected, onSelect }: { chips: CommandChip[]; selected: string | null; onSelect(id: string | null): void }) {
  const open = chips.find((chip) => chip.id === selected) ?? null;
  if (chips.length === 0) return null;
  return <div className="command-strip" data-testid="command-strip">
    <div className="chips">{chips.map((chip) => <button key={chip.id} type="button" data-testid="command-chip" data-status={chipStatus(chip)} data-test={chip.test} className={`command-chip ${chipStatus(chip)}${chip.test ? " test" : ""}`} title={chip.command} onClick={() => onSelect(selected === chip.id ? null : chip.id)}>{chip.test ? "test " : ""}{chipLabel(chip)} {chip.exitCode === 0 ? "✓" : `✗ ${chip.exitCode}`}</button>)}</div>
    {open && <div className="terminal" data-testid="terminal"><div className="terminal-title">$ {open.command} <span>({open.durationMs} ms, exit {open.exitCode})</span></div><pre data-testid="terminal-output">{open.output}</pre></div>}
  </div>;
}
