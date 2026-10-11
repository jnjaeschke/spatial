import type { ArtifactKind } from "../../../plugin-api.ts";
import type { SpecReferenceData } from "../shared/types.ts";

const search: ArtifactKind["search"] = (_view, artifact) => {
  const spec = artifact.data as SpecReferenceData;
  return [{ ref: artifact.id, kind: "spec", body: spec.resolved ? spec.resolved.title + "\n" + spec.resolved.content : spec.url + "\n" + (spec.reason ?? "") }];
};

const render: ArtifactKind["render"] = (view, artifact) => {
  const spec = artifact.data as SpecReferenceData;
  const supported = view.links.filter((link) => link.from === artifact.id && link.kind === "supports").map((link) => link.to);
  const gecko = spec.geckoRefs.map((item) => "- " + item.group + ": " + item.path + ":" + item.line + " (" + item.url + ")").join("\n");
  return ["# " + (spec.resolved?.title ?? "Unresolved spec reference"), "Spec: " + (spec.resolved?.spec ?? "Unknown"), "URL: " + (spec.resolved?.url ?? spec.url), "Origin: " + (spec.origin ?? "unknown"), spec.resolved?.content ?? (spec.url + "\n" + (spec.reason ?? "No resolution reason provided.")), "## Gecko references\n" + (gecko || "None"), "## Supported changes\n" + (supported.join("\n") || "None")].join("\n\n");
};

export const artifactKinds: Record<string, ArtifactKind> = { SpecReference: { search, render } };
export const searchKinds = ["spec"];
