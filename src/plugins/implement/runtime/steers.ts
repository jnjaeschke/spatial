import type { Artifact } from "../../../plugin-api.ts";
import type { AgentSessionData, SteerData } from "../shared/types.ts";

/** The `Steer` artifacts of an epoch, in order. */
export const steersOf = (artifacts: Artifact[], epoch: number | null): Artifact<SteerData>[] =>
  epoch === null ? [] : artifacts.filter((a): a is Artifact<SteerData> => a.type === "Steer" && (a.data as SteerData).epoch === epoch);

/** What a restarted run of `epoch` is told: every steer of the epoch for a fresh prompt, and, when the epoch's latest agent session is older than a steer, that session with the steers it has not seen. A run without a new steer therefore starts fresh and never repeats a steer the session already has. */
export function steerPlan(artifacts: Artifact[], epoch: number | null): { all: string[]; resume: { providerSessionId: string; steers: string[] } | null } {
  if (epoch === null) return { all: [], resume: null };
  const steers = steersOf(artifacts, epoch);
  const session = artifacts.findLast((a) => a.type === "AgentSession" && a.epoch === epoch) as Artifact<AgentSessionData> | undefined;
  const unseen = session ? steers.filter((steer) => artifacts.indexOf(steer) > artifacts.indexOf(session)) : [];
  return { all: steers.map((steer) => steer.data.text), resume: session && unseen.length ? { providerSessionId: session.data.providerSessionId, steers: unseen.map((steer) => steer.data.text) } : null };
}

/** Prompt sections for the steers; none without texts. `editable`: the stopped run could edit files, so the work tree may hold its edits. */
export const steerSections = (texts: string[], editable: boolean): string[] => texts.length
  ? ["# The user stopped you and said", [texts.map((text, index) => texts.length > 1 ? `${index + 1}. ${text}` : text).join("\n\n"), ...(editable ? ["The work tree may hold edits from the stopped run."] : [])].join("\n\n")]
  : [];

/** Whether the run after the epoch's newest steer resumed the stopped agent session: read from the first agent session that follows the steer (later sessions resume for verification retries too). Null until one exists. */
export function steerOutcome(artifacts: Artifact[], epoch: number | null): "resumed" | "restarted" | null {
  const steer = steersOf(artifacts, epoch).at(-1);
  if (!steer) return null;
  const next = artifacts.slice(artifacts.indexOf(steer) + 1).find((a) => a.type === "AgentSession" && a.epoch === epoch) as Artifact<AgentSessionData> | undefined;
  return next ? (next.data.resumed ? "resumed" : "restarted") : null;
}
