[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / RootGraphParts

# Interface: RootGraphParts

What a plugin contributes to its root graph.

## Properties

### anchorOn?

> `optional` **anchorOn?**: `string`

The node the session conversation hangs beside; without it the conversation is the first (root) node.

***

### diffId?

> `optional` **diffId?**: `string`

Diff context of chat nodes.

***

### edges

> **edges**: [`GraphEdge`](GraphEdge.md)[]

***

### hosts?

> `optional` **hosts?**: `ReadonlyMap`\<`string`, `string`\>

Threads hosted inside nodes: thread id → host node id.

***

### hunks?

> `optional` **hunks?**: `object`[]

#### file

> **file**: [`DiffFile`](../../../shared/types/interfaces/DiffFile.md)

#### hunk

> **hunk**: [`Hunk`](../../../shared/types/interfaces/Hunk.md)

***

### nodes

> **nodes**: [`GraphNode`](GraphNode.md)[]

## Methods

### resolveSub()?

> `optional` **resolveSub**(`anchor`, `nodeIds`): `string` \| `null`

Resolves a chat anchor that is not a node id (e.g. `<id>#loc1`) to a node id, or null.

#### Parameters

##### anchor

`string`

##### nodeIds

`ReadonlySet`\<`string`\>

#### Returns

`string` \| `null`
