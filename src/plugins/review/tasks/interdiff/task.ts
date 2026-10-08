import type { DiffData, InterdiffData } from "../../../../shared/types.ts";
import { computeInterdiff } from "../../runtime/interdiff.ts";
import { defineTask } from "../../../../runtime/tasks.ts";

export const interdiff = defineTask<{ fromDiffId: string; toDiffId: string }, { interdiffId: string }>({
  kind: "interdiff",
  async run(ctx, { fromDiffId, toDiffId }) {
    const getDiff = (id: string) => {
      const artifact = ctx.artifacts.get<DiffData>(id);
      if (artifact.type !== "Diff") throw new Error(`Artifact ${id} is not a Diff (got ${artifact.type})`);
      return artifact;
    };
    const from = getDiff(fromDiffId);
    const to = getDiff(toDiffId);
    const { files, conflicts } = await computeInterdiff(ctx.git, from.data, to.data);
    const data: InterdiffData = { fromDiff: fromDiffId, toDiff: toDiffId, files, conflicts };
    const artifact = ctx.artifacts.put("Interdiff", "verified", data);
    ctx.links.put(artifact.id, toDiffId, "about");
    return { interdiffId: artifact.id };
  },
});
