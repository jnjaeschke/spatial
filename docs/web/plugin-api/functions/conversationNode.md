[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / conversationNode

# Function: conversationNode()

> **conversationNode**(`state`, `start`, `root`, `anchors?`): [`GraphNode`](../interfaces/GraphNode.md)

Chat content of a thread; the conversation node of a session start; notes and chats added to a root graph.

## Parameters

### state

[`SessionState`](../../../shared/types/interfaces/SessionState.md)

### start

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<[`WorkflowStartData`](../../../shared/types/interfaces/WorkflowStartData.md)\>

### root

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<[`ChatThreadData`](../../../shared/types/interfaces/ChatThreadData.md)\> \| `undefined`

### anchors?

`string`[]

## Returns

[`GraphNode`](../interfaces/GraphNode.md)
