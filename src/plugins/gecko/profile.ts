import type { RepoProfile } from "../../plugin-api.ts";
import { isGeckoRepo } from "./runtime/gecko-repo.ts";
import { fetchBugMarkdown } from "./runtime/moz-mcp.ts";

const TEST_COMMAND = /^\.\/mach\s+(?:test|mochitest|wpt|gtest|xpcshell-test)(?:\s|$)/;
const REVIEWERS = / r\?[\w.-]+(?:,[\w.-]+)*$/;
const quote = (path: string) => `'${path.replaceAll("'", "'\\''")}'`;

/** Firefox/Gecko: stacks of `Bug N - summary` commits built and tested with `./mach`; try and Phabricator submit run after Accept. */
export const geckoProfile: RepoProfile = {
  id: "gecko",
  description: "Firefox/Gecko source tree (mozilla-central): commit stacks with `Bug N - summary` messages, built and tested with ./mach, reviewed on Phabricator.",
  detect: async (repo) => isGeckoRepo(repo),
  commitStyle: "stack",
  requiresBug: true,
  messageCheck(message) {
    const match = /^Bug (\d+) - (.*)$/.exec(message);
    if (!match) return "The commit message must start with `Bug N - `";
    const summary = match[2]!.replace(REVIEWERS, "").replace(/^r\?[\w.-]+(?:,[\w.-]+)*$/, "").trim();
    if (!summary) return "The commit message needs a summary after `Bug N - `";
    if (/ r\?\S*$/.test(summary)) return "Malformed reviewer list; end the message with ` r?name1,name2`";
    return null;
  },
  buildCommand: "./mach build",
  testCommand: (paths) => `./mach test ${paths.map(quote).join(" ")}`,
  isTestCommand: (command) => TEST_COMMAND.test(command.trim()),
  afterAccept: ["try", "submit"],
  engine: "gecko",
  upstreamBranch: "main",
  async fetchBug(id, { repoMcp, signal }) {
    const moz = repoMcp.moz;
    if (moz?.type !== "http") return null;
    return fetchBugMarkdown(moz.url, Number(id), signal);
  },
  promptNotes: "`searchfox-cli` may be available for repository-wide Gecko search (`searchfox-cli --help`); it may also be unavailable, in which case use local search.",
};
