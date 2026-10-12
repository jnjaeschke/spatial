import { requireArtifact, requireSession, type Artifact, type Route, type Runtime } from "../../../plugin-api.ts";
import type { TryWatcher } from "./try-watcher.ts";
import type { TryPushData } from "../shared/types.ts";

export function tryRoutes(rt: Runtime, watcher: Pick<TryWatcher, "refresh">): Route[] {
  return [
    ["POST", /^\/api\/sessions\/([^/]+)\/try\/pushes\/([^/]+)\/refresh$/, async ({ params }) => {
      const session = requireSession(rt, params[0]!);
      const push = requireArtifact(rt, session.id, params[1]!, "TryPush", "try push");
      return await watcher.refresh(session.id, push as Artifact<TryPushData>);
    }],
  ];
}
