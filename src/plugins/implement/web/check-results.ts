import type { SessionState } from "../../../web/plugin-api.ts";
import type { CheckResult, CheckResultsData } from "../shared/types.ts";

/** The check results of `epoch`: the latest `CheckResults` artifact stamped with it. */
export function checkResults(state: SessionState, epoch: number | null): CheckResult[] {
  const latest = state.artifacts.findLast((a) => a.type === "CheckResults" && a.epoch === epoch);
  return latest ? (latest.data as CheckResultsData).results : [];
}
