[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / rootGraph

# Function: rootGraph()

> **rootGraph**(`state`, `drafts`, `parts`): [`Graph`](../type-aliases/Graph.md)

A plugin's root graph: its nodes and edges, the session conversation (when the session has a start request), notes and chats. A chat anchor resolves to a node, through `resolveSub` (else the message it replies to); a hosted thread resolves to its host.

## Parameters

### state

[`SessionState`](../../../shared/types/interfaces/SessionState.md)

### drafts

[`Draft`](../interfaces/Draft.md)[]

### parts

[`RootGraphParts`](../interfaces/RootGraphParts.md)

## Returns

[`Graph`](../type-aliases/Graph.md)
