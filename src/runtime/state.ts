import type { Id, SessionState } from "../shared/types.ts";
import { sessionView } from "./render-ref.ts";
import type { Runtime } from "./tasks.ts";

export async function buildSessionState(rt: Runtime, sessionId: Id): Promise<SessionState> {
  const { store } = rt;
  const session = store.getSession(sessionId);
  const view = sessionView(store, sessionId);
  const plugins: Record<string, unknown> = {};
  for (const plugin of rt.plugins.plugins) {
    if (!plugin.sessionState) continue;
    try {
      const entry = await plugin.sessionState(rt, session, view);
      if (entry !== undefined) plugins[plugin.id] = entry;
    } catch (e) { console.error(`${plugin.id} session state unavailable: ${(e as Error).message}`); }
  }
  return {
    session,
    artifacts: view.artifacts,
    links: view.links,
    tasks: store.listTasks(sessionId),
    epochs: store.listEpochs(sessionId),
    lastEventId: store.lastEventId(sessionId),
    plugins,
    textLinks: rt.plugins.textLinks.flatMap((hook) => hook(session.worktree)),
  };
}
