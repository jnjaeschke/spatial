import type { Id, SessionState } from "../shared/types.ts";
import type { Store } from "./store.ts";
import type { SearchfoxCapability } from "./tasks.ts";
import { isGeckoRepo } from "./searchfox.ts";
import { selectLinkRev } from "./link-rev.ts";
import { sessionView } from "./render-ref.ts";
import type { PluginRegistry } from "./plugins.ts";

export async function buildSessionState(store: Store, searchfoxCapability: SearchfoxCapability, linkRevs: PluginRegistry["linkRevs"], sessionId: Id): Promise<SessionState> {
  const session = store.getSession(sessionId);
  const view = sessionView(store, sessionId);
  let searchfox: SessionState["searchfox"] = null;
  if (isGeckoRepo(session.worktree)) {
    try { const tip = await searchfoxCapability.tip(); searchfox = { repoBase: tip.repoBase, tipRev: tip.rev, linkRev: selectLinkRev(view, linkRevs) }; }
    catch (e) { console.error(`Searchfox unavailable: ${(e as Error).message}`); }
  }
  return {
    session,
    artifacts: view.artifacts,
    links: view.links,
    tasks: store.listTasks(sessionId),
    epochs: store.listEpochs(sessionId),
    lastEventId: store.lastEventId(sessionId),
    searchfox,
  };
}
