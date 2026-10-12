import type { AcceptanceCheck } from "../shared/types.ts";
import { WPT_TESTS_PREFIX, isWptTest } from "../shared/acceptance.ts";

const META_PREFIX = "testing/web-platform/meta/";
const FAILING = new Set(["FAIL", "ERROR", "TIMEOUT"]);

/** One status named by an `expected:` value; `condition` is the `if …` text of its branch, null for an unconditional value or a bare default. */
export interface Expectation { status: string; condition: string | null }
/** What a WPT metadata section expects: every status named by an `expected:` value, the branches of a conditional list included. */
export interface WptSection { expected: Expectation[]; subtests: Map<string, Expectation[]> }

const expectations = (value: string, condition: string | null): Expectation[] => value.trim().replace(/^\[|\]$/g, "").split(",").map((status) => status.trim()).filter(Boolean).map((status) => ({ status, condition }));

/** Parses the `.ini` shape of `testing/web-platform/meta`: `[test]` sections, indented `[subtest]` sections (`\]` escapes a bracket), `expected: X`, `expected: [X, Y]` and `expected:` followed by indented `if …: X` lines and an optional bare default. Other keys and their blocks are ignored. Sections are keyed by name; a name that repeats merges. */
export function parseWptMeta(text: string): Map<string, WptSection> {
  const sections = new Map<string, WptSection>();
  let section: WptSection | null = null, target: Expectation[] | null = null;
  let blockIndent = -1, inExpected = false;
  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    // A section name may contain ` #` ("[touchend #1: …]"); only value lines carry trailing comments.
    const line = trimmed.startsWith("[") ? trimmed : trimmed.replace(/\s+#.*$/, "");
    if (!line || line.startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    if (blockIndent >= 0 && indent > blockIndent) {
      if (inExpected) {
        const branch = /^if\s+(.*):\s+(\[[^\]]*\]|\S+)$/.exec(line);
        target!.push(...(branch ? expectations(branch[2]!, `if ${branch[1]}`) : expectations(line, null)));
      }
      continue;
    }
    blockIndent = -1;
    const heading = /^\[(.*)\]$/.exec(line);
    if (heading) {
      const name = heading[1]!.replace(/\\(.)/g, "$1");
      if (indent === 0) {
        section = sections.get(name) ?? { expected: [], subtests: new Map() };
        sections.set(name, section);
        target = section.expected;
      } else if (section) {
        target = section.subtests.get(name) ?? [];
        section.subtests.set(name, target);
      }
      continue;
    }
    const key = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!key || !target) continue;
    inExpected = key[1] === "expected";
    if (key[2]) { if (inExpected) target.push(...expectations(key[2], null)); continue; }
    blockIndent = indent;
  }
  return sections;
}

/** Whether the metadata expects a failure at the base for the named subtests (each one), or, with none named, for the test as a whole or for at least one subtest. `evidence` is the line shown to the user; when every failing expectation is conditional, the conditions are part of it. */
export function wptBaseEvidence(meta: Map<string, WptSection>, subtests: string[]): { evidence: string } | { problem: string } {
  const sections = [...meta.values()];
  const hits: Expectation[] = [];
  const failing = (values: Expectation[]) => {
    const groups = new Map<string | null, Expectation[]>();
    for (const value of values) groups.set(value.condition, [...(groups.get(value.condition) ?? []), value]);
    const found = [...groups.values()].filter((group) => group.every((value) => FAILING.has(value.status))).flat();
    hits.push(...found);
    return found.length > 0;
  };
  const label = () => {
    const status = [...new Set(hits.map((hit) => hit.status))].join("/");
    const conditions = [...new Set(hits.map((hit) => hit.condition))];
    return conditions.every((condition) => condition !== null) ? `${status} at base (${conditions.join("; ")})` : `${status} at base`;
  };
  if (subtests.length > 0) {
    const missing = subtests.filter((name) => !sections.some((section) => failing(section.subtests.get(name) ?? [])));
    return missing.length > 0 ? { problem: `the metadata expects no failure for ${missing.map((name) => `"${name}"`).join(", ")}` } : { evidence: `${label()}: ${subtests.length} of ${subtests.length} named subtests` };
  }
  if (sections.some((section) => failing(section.expected))) return { evidence: `${label()}: the test as a whole` };
  const count = sections.reduce((total, section) => total + [...section.subtests.values()].filter(failing).length, 0);
  return count > 0 ? { evidence: `${label()}: ${count} subtest${count === 1 ? "" : "s"}` } : { problem: "the metadata expects no failure" };
}

/** Checks each check against the base: a `new-test` path must not exist; a `covering-test` or `failing-test` path must (a `covering-test` may also name a path in `added`, the files earlier steps add); a web-platform `failing-test` needs metadata that expects its failure and gets `baseEvidence`; a `measure` needs a command and a goal. Invalid checks are dropped with a reason. `show` reads a file at the base and rejects when it is missing. */
export async function verifyChecks(checks: AcceptanceCheck[], show: (path: string) => Promise<string>, added: ReadonlySet<string> = new Set()): Promise<{ verified: AcceptanceCheck[]; dropped: string[] }> {
  const verified: AcceptanceCheck[] = [], dropped: string[] = [];
  const read = (path: string) => show(path).catch(() => null);
  for (const check of checks) {
    if (check.kind === "measure") {
      if (check.command.trim() && check.goal.trim()) verified.push(check);
      else dropped.push("measure: needs a command and a goal");
      continue;
    }
    if (!check.path.trim()) { dropped.push(`${check.kind}: needs a path`); continue; }
    const exists = (check.kind === "covering-test" && added.has(check.path)) || (await read(check.path)) !== null;
    if (check.kind === "new-test") {
      if (exists) dropped.push(`new-test ${check.path}: the file already exists at the base`);
      else verified.push(check);
      continue;
    }
    if (!exists) { dropped.push(`${check.kind} ${check.path}: file not found at the base`); continue; }
    if (check.kind === "covering-test" || !isWptTest(check.path)) { verified.push(check); continue; }
    const meta = await read(`${META_PREFIX}${check.path.slice(WPT_TESTS_PREFIX.length)}.ini`);
    if (meta === null) { dropped.push(`failing-test ${check.path}: no WPT metadata at the base`); continue; }
    const result = wptBaseEvidence(parseWptMeta(meta), check.subtests);
    if ("problem" in result) dropped.push(`failing-test ${check.path}: ${result.problem}`);
    else verified.push({ ...check, baseEvidence: result.evidence });
  }
  return { verified, dropped };
}
