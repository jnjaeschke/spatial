import { createContext, type ComponentType } from "react";
import type { Artifact, Link } from "../shared/types.ts";

/** Props of a plugin component shown under a chat reply for one artifact derived from it. */
export interface ReplyActionProps { artifact: Artifact; sessionId: string }

/** Reply action components by artifact type, and the artifacts derived from a chat message. */
export const ReplyActionsContext = createContext<{ sessionId: string; components: Record<string, ComponentType<ReplyActionProps>>; derived(messageId: string): Artifact[] } | null>(null);

/** Artifacts linked `derivedFrom →` the message, in link order. */
export function derivedArtifacts(view: { artifacts: Artifact[]; links: Link[] }, messageId: string): Artifact[] {
  const byId = new Map(view.artifacts.map((artifact) => [artifact.id, artifact]));
  return view.links.filter((link) => link.kind === "derivedFrom" && link.to === messageId).flatMap((link) => { const artifact = byId.get(link.from); return artifact ? [artifact] : []; });
}
