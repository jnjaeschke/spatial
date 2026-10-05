import type { Id, SessionState } from "../shared/types.ts";
import type { Store } from "./store.ts";

export function buildSessionState(store: Store, sessionId: Id): SessionState {
  return {
    session: store.getSession(sessionId),
    artifacts: store.listArtifacts(sessionId),
    links: store.listLinks(sessionId),
    tasks: store.listTasks(sessionId),
    lastEventId: store.lastEventId(sessionId),
  };
}
