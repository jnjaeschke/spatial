[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / addChats

# Function: addChats()

> **addChats**(`g`, `state`, `drafts`, `hostOf`, `nodeIds`, `resolve`, `diffId`, `hunks`): `void`

Hosts threads anchored on a node with hosted threads inside that node and adds nodes for the remaining chats; unresolvable anchors are skipped.

## Parameters

### g

[`Graph`](../type-aliases/Graph.md)

### state

[`SessionState`](../../../shared/types/interfaces/SessionState.md)

### drafts

[`Draft`](../interfaces/Draft.md)[]

### hostOf

`Map`\<`string`, `string`\>

### nodeIds

`Set`\<`string`\>

### resolve

(`anchor`) => `string` \| `null`

### diffId

`string`

### hunks

`object`[]

## Returns

`void`
