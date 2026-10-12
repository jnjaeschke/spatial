import { useCallback, useEffect, useState } from "react";
import { ErrorText, routeUrl, useAction, type RepoPanelProps } from "../../../web/plugin-api.ts";
import type { MemoryScope, MemoryView, SteerMemory } from "../shared/types.ts";
import { MEMORY_KINDS, MEMORY_PHASES } from "../runtime/memories.ts";
import { memoriesClient } from "./client.ts";

const toggle = (list: string[], value: string) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

function MemoryForm({ initial, onSave, onCancel }: { initial: SteerMemory; onSave(memory: SteerMemory): Promise<unknown>; onCancel(): void }) {
  const [draft, setDraft] = useState(initial);
  const { error, run } = useAction();
  const area = (name: string, value: string, change: (value: string) => void) => <label className="memory-field"><span>{name}</span><textarea aria-label={name} rows={2} value={value} onChange={(event) => change(event.currentTarget.value)} /></label>;
  const checks = (name: string, all: string[], selected: string[], change: (next: string[]) => void) => <fieldset className="memory-field"><legend>{name}</legend>{all.map((value) => <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={() => change(toggle(selected, value))} /> {value}</label>)}</fieldset>;
  return <form className="memory-form" onSubmit={(event) => { event.preventDefault(); void run(() => onSave(draft)); }}>
    {area("situation", draft.situation, (situation) => setDraft({ ...draft, situation }))}
    {area("wanted", draft.wanted, (wanted) => setDraft({ ...draft, wanted }))}
    {area("observed", draft.observed, (observed) => setDraft({ ...draft, observed }))}
    <label className="memory-field"><span>why</span><input aria-label="why" value={draft.why ?? ""} onChange={(event) => setDraft({ ...draft, why: event.currentTarget.value.trim() ? event.currentTarget.value : null })} /></label>
    {checks("phases", MEMORY_PHASES, draft.phases, (phases) => setDraft({ ...draft, phases }))}
    {checks("kinds", MEMORY_KINDS, draft.kinds, (kinds) => setDraft({ ...draft, kinds }))}
    <button type="submit">Save</button> <button type="button" onClick={onCancel}>Cancel</button>
    <ErrorText error={error} />
  </form>;
}

/** The remembered preferences of a repository and the global ones, with edit, move and delete. */
export function MemoriesPanel({ repoDir }: RepoPanelProps) {
  const [memories, setMemories] = useState<MemoryView[] | null>(null);
  const [editing, setEditing] = useState<string | null>(() => new URL(location.href).searchParams.get("memory"));
  const { error, run } = useAction();
  const reload = useCallback(() => memoriesClient.list(repoDir).then(setMemories), [repoDir]);
  useEffect(() => { void run(reload); }, [run, reload]);
  const save = (view: MemoryView) => async (memory: SteerMemory) => { await memoriesClient.put(repoDir, view.scope, view.key, memory); setEditing(null); await reload(); };
  const remove = (view: MemoryView) => run(async () => { await memoriesClient.remove(repoDir, view.scope, view.key); await reload(); });
  const move = (view: MemoryView) => run(async () => {
    const to: MemoryScope = view.scope === "repo" ? "global" : "repo";
    if (memories?.some((other) => other.scope === to && other.key === view.key)) throw new Error(`${to === "repo" ? "This repo" : "Everywhere"} already has a memory named ${view.key}`);
    await memoriesClient.put(repoDir, to, view.key, view.memory);
    await memoriesClient.remove(repoDir, view.scope, view.key);
    await reload();
  });
  return <section className="memories-panel" data-testid="memories-panel">
    <h3>Memories</h3>
    <ErrorText error={error} />
    {memories?.length === 0 && <p className="empty">None yet. When you stop and steer a running implement session, what you asked for is remembered here.</p>}
    <ul className="memories">{(memories ?? []).map((view) => {
      const id = `${view.scope}/${view.key}`;
      return <li key={id} className="memory" data-testid="memory-item" data-memory={id}>
        {editing === id ? <MemoryForm initial={view.memory} onSave={save(view)} onCancel={() => setEditing(null)} /> : <>
          <p><b>When</b> {view.memory.situation}: {view.memory.wanted}</p>
          <p className="memory-detail">Observed: {view.memory.observed}{view.memory.why ? ` · Why: ${view.memory.why}` : ""}</p>
          <p className="memory-detail"><span className="badge">{view.scope === "repo" ? "this repo" : "everywhere"}</span>{view.confirmed && <span className="badge">confirmed</span>} phases: {view.memory.phases.join(", ")} · kinds: {view.memory.kinds.length ? view.memory.kinds.join(", ") : "all"} · <a href={routeUrl({ kind: "session", sessionId: view.memory.source.sessionId, place: null })}>source session</a></p>
          <button type="button" onClick={() => setEditing(id)}>Edit</button> <button type="button" onClick={() => void move(view)}>{view.scope === "repo" ? "Move to everywhere" : "Move to this repo"}</button> <button type="button" onClick={() => void remove(view)}>Delete</button>
        </>}
      </li>;
    })}</ul>
  </section>;
}
