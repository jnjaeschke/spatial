import type { TaskRecord } from "../../../plugin-api.ts";
import type { Engine } from "../shared/types.ts";
import { engineActivity, engineTasks } from "../shared/engine.ts";
import type { EngineDifference, ImplementationsData } from "../shared/types.ts";
import { usedSites } from "../shared/engine.ts";

/** Whether a mapping, search or alignment of the algorithm in `engine` is running, else the error of the latest failure that no later task of its kind superseded (`engineTasks`, `engineActivity`). */
export function columnState(tasks: Pick<TaskRecord, "kind" | "status" | "input" | "error">[], algorithmId: string, engine: Engine): { busy: boolean; failed: string | null } {
  const { mapping, searching, aligning, error } = engineActivity(engineTasks(tasks), algorithmId, engine);
  const busy = mapping || searching || aligning;
  return { busy, failed: busy ? null : error };
}

/** Whether Compare applies: at least two engines have a confirmed or spec-link site. */
export const compareEnabled = (mappings: ImplementationsData["mappings"]) => Object.values(mappings).filter((mapping) => usedSites(mapping).length).length >= 2;

/** The steps and code lines a difference cites, for highlighting. */
export function differenceTargets(difference: EngineDifference): { steps: Set<string>; code: { engine: Engine; path: string; line: number }[] } {
  return { steps: new Set(difference.steps), code: difference.claims.flatMap((claim) => claim.code.map(({ path, line }) => ({ engine: claim.engine, path, line }))) };
}

/** Whether a cell (lines `from`–`to` of `path` in `engine`) holds a line the hovered difference cites. */
export function cellHighlighted(targets: ReturnType<typeof differenceTargets> | null, engine: Engine, path: string, from: number, to: number): boolean {
  return !!targets?.code.some((ref) => ref.engine === engine && ref.path === path && ref.line >= from && ref.line <= to);
}
