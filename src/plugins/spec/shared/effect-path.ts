import type { SpecHop } from "../../../plugin-api.ts";
import { specRef } from "./refs.ts";

/** The boxes a witness path opens, in order: each algorithm it enters, from the step of the hop's call site; hops within one algorithm are skipped. */
export function pathOpens(hops: SpecHop[]): { anchor: string; from: { anchor: string; step: string } }[] {
  return hops.filter((hop) => specRef(hop.from.spec, hop.from.anchor) !== specRef(hop.to.spec, hop.to.anchor))
    .map((hop) => ({ anchor: specRef(hop.to.spec, hop.to.anchor), from: { anchor: specRef(hop.site.spec, hop.site.anchor), step: hop.site.step_path?.join(".") ?? "" } }));
}
