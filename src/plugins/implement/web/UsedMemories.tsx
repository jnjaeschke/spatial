import { plural, type Epoch, type SessionState } from "../../../web/plugin-api.ts";
import type { UsedMemoriesData } from "../shared/types.ts";

/** The remembered preferences the epoch's tasks put in their prompts. */
export function UsedMemories({ state, epoch }: { state: SessionState; epoch: Epoch | null }) {
  const used = [...new Set(state.artifacts.filter((a) => a.type === "UsedMemories" && a.epoch === (epoch?.n ?? null)).flatMap((a) => (a.data as UsedMemoriesData).entries.map((entry) => `${entry.scope}/${entry.key}`)))];
  if (used.length === 0) return null;
  return <p className="used-memories" data-testid="used-memories">Following {plural(used.length, "remembered preference")}: {used.join(", ")}</p>;
}
