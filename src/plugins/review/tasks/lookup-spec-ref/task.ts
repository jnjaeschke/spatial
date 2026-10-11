import { defineTask } from "../../../../plugin-api.ts";
import { resolveSpecReference } from "../../../spec/api.ts";

/** Resolves a linked spec section and stores it without associating it with a code change. */
export const lookupSpecRef = defineTask<{ ref: string }, { specId: string }>({
  kind: "lookupSpecRef",
  async run(ctx, { ref }) {
    const data = await resolveSpecReference(ctx, ref, "link");
    const spec = ctx.artifacts.put("SpecReference", data.resolved ? "verified" : "proposed", data);
    return { specId: spec.id };
  },
});
