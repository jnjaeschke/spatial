/** Source of the regular expression a reviewer list must match: comma-separated names, `#` for groups, `!` for blocking. */
export const REVIEWERS_PATTERN = "^#?[\\w.-]+!?(?:\\s*,\\s*#?[\\w.-]+!?)*$";

interface Named { name: string; blocking?: boolean; count?: number }
interface ReviewerJson { mots_groups?: Named[]; herald_groups?: Named[]; herald_individuals?: Named[]; recent_groups?: Named[]; recent_individuals?: Named[] }

/** Reviewers from `./mach file-info reviewers --format json`. Module and Herald reviewers are the suggestion; recent reviewers are only candidates, as the repo's find-reviewer skill treats them. */
export function parseReviewerJson(stdout: string): { suggested: string[]; candidates: { name: string; count: number }[] } {
  let json: ReviewerJson;
  try { json = JSON.parse(stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}") + 1)) as ReviewerJson; }
  catch { throw new Error(`mach file-info reviewers printed no JSON: ${stdout.trim().split("\n", 1)[0]}`); }
  const group = (n: Named) => `#${n.name}${n.blocking ? "!" : ""}`, person = (n: Named) => `${n.name}${n.blocking ? "!" : ""}`;
  const suggested = [...new Set([...(json.mots_groups ?? []).map((n) => `#${n.name}`), ...(json.herald_groups ?? []).map(group), ...(json.herald_individuals ?? []).map(person)])];
  const candidates = [...(json.recent_groups ?? []).map((n) => ({ name: `#${n.name}`, count: n.count ?? 0 })), ...(json.recent_individuals ?? []).map((n) => ({ name: n.name, count: n.count ?? 0 }))];
  return { suggested, candidates };
}

/** moz-phab flags for a reviewer list; names ending in `!` are blocking. */
export function reviewerArgs(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (!new RegExp(REVIEWERS_PATTERN).test(trimmed)) throw new Error("Reviewers must be a comma-separated list of names");
  const names = trimmed.split(",").map((name) => name.trim());
  const reviewers = names.filter((name) => !name.endsWith("!")), blockers = names.filter((name) => name.endsWith("!")).map((name) => name.slice(0, -1));
  return [...(reviewers.length ? ["--reviewer", reviewers.join(",")] : []), ...(blockers.length ? ["--blocker", blockers.join(",")] : [])];
}

/** `moz-phab` argv submitting `base..HEAD` without prompting; an explicit start revision is exclusive in moz-phab. */
export function submitArgs({ base, reviewers, wip }: { base: string; reviewers: string; wip: boolean }): string[] {
  return ["submit", "--yes", ...(wip ? ["--wip"] : []), ...reviewerArgs(reviewers), base, "HEAD"];
}
