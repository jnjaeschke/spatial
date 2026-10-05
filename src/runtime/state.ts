import type { Id, SessionState } from "../shared/types.ts";
import type { Store } from "./store.ts";
import type { SearchfoxCapability } from "./tasks.ts";
import { isGeckoRepo } from "./searchfox.ts";

export async function buildSessionState(store: Store, searchfox: SearchfoxCapability, sessionId: Id): Promise<SessionState> {
  const session = store.getSession(sessionId);
  let sourceBase: string | null = null;
  if (isGeckoRepo(session.repo)) {
    try { sourceBase = await searchfox.sourceBase(); }
    catch (e) { console.error(`Searchfox unavailable: ${(e as Error).message}`); }
  }
  return {
    session,
    artifacts: store.listArtifacts(sessionId),
    links: store.listLinks(sessionId),
    tasks: store.listTasks(sessionId),
    lastEventId: store.lastEventId(sessionId),
    sourceBase,
  };
}
