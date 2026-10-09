import type { WriteMode } from "../shared/types.ts";

/** What each write mode lets the implement agent do; the title is the option's description. */
export const WRITE_MODES: { id: WriteMode; label: string; title: string }[] = [
  { id: "auto", label: "Auto", title: "The agent edits files and runs commands; the CLI's own safety checks decide what needs approval." },
  { id: "full", label: "Full access", title: "The agent edits files and runs commands without approvals or sandboxing." },
  { id: "editsOnly", label: "Edits only", title: "The agent edits files only; spatial runs the repository's check command and commits." },
];
const key = (repoDir: string) => `spatial-ide:write-mode:${repoDir}`;
export function readWriteMode(storage: Pick<Storage, "getItem">, repoDir: string): WriteMode {
  const value = storage.getItem(key(repoDir));
  return WRITE_MODES.some((mode) => mode.id === value) ? value as WriteMode : "auto";
}
export function saveWriteMode(storage: Pick<Storage, "setItem">, repoDir: string, mode: WriteMode): void { storage.setItem(key(repoDir), mode); }
