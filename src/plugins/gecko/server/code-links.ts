import { HttpError, readJson, requireSession, runGit, send, sessionProfile, sessionView, type DiffData, type Route, type Runtime } from "../../../plugin-api.ts";
import { specServices } from "../../spec/api.ts";
import { resolveCodeLinks } from "../runtime/code-links.ts";
import { linkRev } from "../runtime/link-rev.ts";
import type { CodeLinksData } from "../shared/types.ts";

export function codeLinkRoutes(rt: Runtime): Route[] {
  return [
    ["POST", /^\/api\/sessions\/([^/]+)\/code-links$/, async ({ req, res, params }) => {
      const session = requireSession(rt, params[0]!);
      const body = await readJson(req);
      if (!Array.isArray(body.tokens) || body.tokens.length < 1 || body.tokens.length > 50 || body.tokens.some((token) => typeof token !== "string" || token.length > 200)) throw new HttpError(400, "tokens must be 1–50 strings of at most 200 characters");
      const view = sessionView(rt.store, session.id);
      const rev = linkRev(view);
      if (!rev || (await sessionProfile(rt.plugins.repoProfiles, view, session.worktree)).id !== "gecko") throw new HttpError(409, "Code links require a Gecko session with a known upstream revision");
      const diff = rt.store.listArtifacts(session.id, "Diff").findLast((artifact) => (artifact.data as DiffData).upstreamRev === rev);
      const prior: Record<string, string | null> = {};
      for (const artifact of rt.store.listArtifacts(session.id, "CodeLinks")) {
        const data = artifact.data as CodeLinksData;
        if (data.rev === rev) Object.assign(prior, data.links);
      }
      const missing = [...new Set(body.tokens as string[])].filter((token) => !Object.hasOwn(prior, token));
      let added: Record<string, string | null> = {};
      if (missing.length) {
        const { searchfox } = specServices(rt);
        let tip;
        try { tip = await searchfox.tip(); }
        catch (e) { throw new HttpError(502, `Searchfox unavailable: ${(e as Error).message}`); }
        added = await resolveCodeLinks({
          git: (args) => runGit(session.worktree, args),
          searchfox, repoBase: tip.repoBase, rev,
          diffPaths: (diff?.data as DiffData | undefined)?.files.map((file) => file.path) ?? [],
        }, missing);
        if (Object.keys(added).length) {
          rt.putArtifact<CodeLinksData>("runtime", { sessionId: session.id, type: "CodeLinks", status: "verified", data: { rev, links: added }, provenance: { taskId: "runtime" } });
        }
      }
      const links = { ...prior, ...added };
      send(res, 200, { links: Object.fromEntries((body.tokens as string[]).map((token) => [token, links[token] ?? null])) });
    }],
  ];
}
