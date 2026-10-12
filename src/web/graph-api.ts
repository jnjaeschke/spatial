/**
 * The graph building blocks web plugins use to build their canvas graphs.
 * Free of React and DOM, so plugin graph modules load under Node; `plugin-api.ts` re-exports it.
 */
export type { Draft } from "./chat-context.ts";
/** Markdown as one line of plain text. */
export { plainText } from "../shared/plain-text.ts";
export { escapeRegex } from "../shared/regex.ts";
export type { Graph, GraphEdge, GraphNode, GraphNodeData, CoreNodeData, PluginNodeData, NoteNodeData, ChatNodeData, ConversationNodeData, DecisionNodeData, DiagramNodeData, HostedThread, PlacedNode, RootGraphParts } from "./graph.ts";
/** Width of cards and of satellites. */
export { NODE_WIDTH, SATELLITE_WIDTH } from "./graph.ts";
/** Diagram node size estimate. */
export { diagramSize } from "./graph.ts";
/** Core node kind check. */
export { isCoreKind } from "./graph.ts";
/** Dagre layout of sized nodes; and column placement of satellites beside their anchors. */
export { layout, placeSatellites } from "./graph.ts";
/** Whether a node hangs beside the node it is anchored on; adds to `gone` every node whose anchors are all gone. */
export { isSatellite, cascade } from "./graph.ts";
/** The latest WorkflowStart and the root chat thread anchored on it. */
export { latestStart, rootThread } from "./graph.ts";
/** Shared root graph, anchored subgraphs and diagram message lookup. */
export { rootGraph, subgraph, diagramsByMessage } from "./graph.ts";
/** The root graph of a plain chat session. */
export { conversationGraph } from "./graph.ts";
/** Chat content of a thread; the conversation node of a session start; notes and chats added to a root graph. */
export { threadContent, conversationNode, addNotes, addChats } from "./graph.ts";
/** Estimated line count of text wrapped at a width in characters. */
export { lines } from "./graph.ts";
export type { FreePosition } from "./free-positions.ts";
/** Diff hunk lines numbered on both sides. */
export { numberLines } from "../shared/diff-lines.ts";
