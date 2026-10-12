[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / rootGraph

# Function: rootGraph()

> **rootGraph**(`state`, `drafts`, `parts`): [`Graph`](../type-aliases/Graph.md)

A plugin's root graph: its nodes and edges (the first node is the root), notes and chats. A chat anchor resolves to a node, through `resolveSub` (else the message it replies to); an anchor on the workflow start resolves to the root; a hosted thread resolves to its host. The session's root thread is never a chat node.

## Parameters

### state

[`SessionState`](../../../shared/types/interfaces/SessionState.md)

### drafts

[`Draft`](../interfaces/Draft.md)[]

### parts

[`RootGraphParts`](../interfaces/RootGraphParts.md)

## Returns

[`Graph`](../type-aliases/Graph.md)
