import { Position, type Node, type NodeProps } from "@xyflow/react";
import type { LocationNodeData } from "../graph.ts";
import { useContext } from "react";
import { InlineText, Box, CodeLinksContext } from "../../../../web/plugin-api.ts";

export type LocationFlowNode = Node<LocationNodeData & Record<string, unknown>, "location">;

export function LocationNode({ data }: NodeProps<LocationFlowNode>) {
  const { location } = data;
  const codeLinks = useContext(CodeLinksContext);
  const label = `${location.path}:${location.line}`;
  const href = codeLinks?.fileUrl(location.path, location.line) ?? null;
  return <Box kind="location" testId="investigation-location" data={{ "data-anchor": data.anchor }} handles={{ target: Position.Top, source: Position.Bottom }} title={href ? <a href={href} target="_blank" rel="noreferrer" className="nodrag">{label}</a> : label}>
    <div className="body nodrag nopan"><pre className="quote">{location.quote}</pre><p><InlineText text={location.why} /></p></div>
  </Box>;
}
