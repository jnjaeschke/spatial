import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { LocationNodeData } from "../graph.ts";
import { InlineText } from "../../../../web/plugin-api.ts";

export type LocationFlowNode = Node<LocationNodeData & Record<string, unknown>, "location">;

export function LocationNode({ data }: NodeProps<LocationFlowNode>) {
  const { location, searchfox } = data;
  const label = `${location.path}:${location.line}`;
  const href = searchfox ? `${searchfox.repoBase}rev/${searchfox.rev}/${location.path}#${location.line}` : null;
  return <div className="node location-node" data-testid="investigation-location" data-anchor={data.anchor}>
    <Handle type="target" position={Position.Top} />
    <div className="title">{href ? <a href={href} target="_blank" rel="noreferrer" className="nodrag">{label}</a> : label}</div>
    <div className="body nodrag nopan"><pre className="quote">{location.quote}</pre><p><InlineText text={location.why} /></p></div>
    <Handle type="source" position={Position.Bottom} />
  </div>;
}
