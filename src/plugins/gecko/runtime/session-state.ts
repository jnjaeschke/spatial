import type { Runtime, Session, SessionView } from "../../../plugin-api.ts";
import { sessionProfile } from "../../../plugin-api.ts";
import { specServices } from "../../spec/api.ts";
import type { GeckoSessionState } from "../shared/types.ts";
import { linkRev } from "./link-rev.ts";

/** The Searchfox base for a Gecko session's code links; undefined for other sessions. Throws when Searchfox is unreachable. */
export async function geckoSessionState(rt: Runtime, session: Session, view: SessionView): Promise<GeckoSessionState | undefined> {
  if ((await sessionProfile(rt.plugins.repoProfiles, view, session.worktree)).id !== "gecko") return undefined;
  const tip = await specServices(rt).searchfox.tip();
  return { repoBase: tip.repoBase, tipRev: tip.rev, linkRev: linkRev(view) };
}
