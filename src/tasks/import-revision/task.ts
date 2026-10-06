import { importRevisionInto } from "../../runtime/import-revision.ts";
import { resolveRevisionHost } from "../../runtime/revision-host.ts";
import { defineTask } from "../../runtime/tasks.ts";

export const importRevision = defineTask<{ host: string | null; id: number }, { base: string; head: string }>({
  kind: "importRevision",
  run: (ctx, { host, id }) => importRevisionInto(ctx.repo, ctx.git, { host: resolveRevisionHost(ctx.repo, host), id }),
});
