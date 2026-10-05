import type { Id, SessionState } from "../shared/types.ts";
import type { Store } from "./store.ts";
import type { SearchfoxCapability } from "./tasks.ts";
import { isGeckoRepo } from "./searchfox.ts";

export async function buildSessionState(store: Store, searchfoxCapability: SearchfoxCapability, sessionId: Id): Promise<SessionState> {
  const session = store.getSession(sessionId);
  let searchfox: SessionState["searchfox"] = null;
  if (isGeckoRepo(session.repo)) {
    try { const tip = await searchfoxCapability.tip(); searchfox = { repoBase: tip.repoBase, tipRev: tip.rev }; }
    catch (e) { console.error(`Searchfox unavailable: ${(e as Error).message}`); }
  }
  return {
    session,
    artifacts: store.listArtifacts(sessionId),
    links: store.listLinks(sessionId),
    tasks: store.listTasks(sessionId),
    lastEventId: store.lastEventId(sessionId),
    searchfox,
  };
}
