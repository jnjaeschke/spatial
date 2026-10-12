import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { LocationNodeData } from "../graph.ts";
import { InlineText, Box, fileUrl } from "../../../../web/plugin-api.ts";

export type LocationFlowNode = Node<LocationNodeData & Record<string, unknown>, "location">;

export function LocationNode({ data }: NodeProps<LocationFlowNode>) {
  const { location, searchfox } = data;
  const label = `${location.path}:${location.line}`;
  const href = searchfox ? fileUrl(searchfox, location.path, location.line) : null;
  return <Box kind="location" testId="investigation-location" data={{ "data-anchor": data.anchor }} handles={{ target: Position.Top, source: Position.Bottom }} title={href ? <a href={href} target="_blank" rel="noreferrer" className="nodrag">{label}</a> : label}>
    <div className="body nodrag nopan"><pre className="quote">{location.quote}</pre><p><InlineText text={location.why} /></p></div>
  </Box>;
}
