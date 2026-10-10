[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / CanvasModel

# Interface: CanvasModel

What the phase view tells the canvas about its graph; everything but `graph` is optional.

## Properties

### layers?

> `optional` **layers?**: `object`

Layers the user can hide ("Show on canvas"); `hide` removes the hidden layers' nodes and what hangs off them.

#### list

> **list**: `object`[]

#### hide()

> **hide**(`graph`, `hidden`): [`Graph`](../type-aliases/Graph.md)

##### Parameters

###### graph

[`Graph`](../type-aliases/Graph.md)

###### hidden

`ReadonlySet`\<`string`\>

##### Returns

[`Graph`](../type-aliases/Graph.md)

***

### places?

> `optional` **places?**: `object`

Named places of a canvas, e.g. a review's stack, one patch, one change. Ids are opaque to core.

#### crumbs()

> **crumbs**(`graph`, `place`): `object`[]

Breadcrumb from the top place to `place`.

##### Parameters

###### graph

[`Graph`](../type-aliases/Graph.md)

###### place

`string`

##### Returns

`object`[]

#### graph()

> **graph**(`graph`, `place`): [`Graph`](../type-aliases/Graph.md) \| `null`

The graph shown at `place`, or null when the place does not exist in `graph`.

##### Parameters

###### graph

[`Graph`](../type-aliases/Graph.md)

###### place

`string`

##### Returns

[`Graph`](../type-aliases/Graph.md) \| `null`

#### initial()

> **initial**(`graph`): `string`

The place shown first, and the fallback for a stored place `graph` rejects.

##### Parameters

###### graph

[`Graph`](../type-aliases/Graph.md)

##### Returns

`string`

#### open()

> **open**(`graph`, `place`, `nodeId`): `string` \| `null`

The place a node opens into, or null when it opens nothing.

##### Parameters

###### graph

[`Graph`](../type-aliases/Graph.md)

###### place

`string`

###### nodeId

`string`

##### Returns

`string` \| `null`

#### up()

> **up**(`graph`, `place`): \{ `nodeId`: `string`; `place`: `string`; \} \| `null`

The enclosing place and the node in it that leads to `place`; null at the top.

##### Parameters

###### graph

[`Graph`](../type-aliases/Graph.md)

###### place

`string`

##### Returns

\{ `nodeId`: `string`; `place`: `string`; \} \| `null`

***

### Provider?

> `optional` **Provider?**: `ComponentType`\<[`CanvasProviderProps`](CanvasProviderProps.md)\>

Wraps the canvas in the plugin's contexts.

***

### stack?

> `optional` **stack?**: `object`

Stacks (parallel lanes) lay out with `layout` instead of dagre at the places where `is` holds.

#### is()

> **is**(`graph`, `place`): `boolean`

##### Parameters

###### graph

[`Graph`](../type-aliases/Graph.md)

###### place

`string` \| `null`

##### Returns

`boolean`

#### layout()

> **layout**(`nodes`, `edges`): `Map`\<`string`, \{ `x`: `number`; `y`: `number`; \}\>

##### Parameters

###### nodes

[`PlacedNode`](PlacedNode.md)[]

###### edges

[`GraphEdge`](GraphEdge.md)[]

##### Returns

`Map`\<`string`, \{ `x`: `number`; `y`: `number`; \}\>

## Methods

### collapsedByDefault()?

> `optional` **collapsedByDefault**(`graph`): `string`[]

Collapse ids that start collapsed.

#### Parameters

##### graph

[`Graph`](../type-aliases/Graph.md)

#### Returns

`string`[]

***

### graph()

> **graph**(`state`, `drafts`): [`Graph`](../type-aliases/Graph.md) \| `null`

Root graph (first node = root); null when there is nothing to show. Core adds notes, chats and free positions.

#### Parameters

##### state

[`SessionState`](../../../shared/types/interfaces/SessionState.md)

##### drafts

[`Draft`](Draft.md)[]

#### Returns

[`Graph`](../type-aliases/Graph.md) \| `null`

***

### guide()?

> `optional` **guide**(`graph`, `place`): [`GuideStep`](GuideStep.md)[]

The reading path of the guide bar and its `n`/`p`/`r` keys at a place (null without places); none or empty shows no bar.

#### Parameters

##### graph

[`Graph`](../type-aliases/Graph.md)

##### place

`string` \| `null`

#### Returns

[`GuideStep`](GuideStep.md)[]

***

### layoutEdges()?

> `optional` **layoutEdges**(`nodes`, `edges`): [`GraphEdge`](GraphEdge.md)[]

Edges that only steer the dagre layout; the displayed edges stay as they are.

#### Parameters

##### nodes

[`GraphNode`](GraphNode.md)[]

##### edges

[`GraphEdge`](GraphEdge.md)[]

#### Returns

[`GraphEdge`](GraphEdge.md)[]

***

### revealWhenAdded()?

> `optional` **revealWhenAdded**(`node`): `boolean`

Nodes to center when they first appear after the canvas has loaded (a freshly generated diagram).

#### Parameters

##### node

[`GraphNode`](GraphNode.md)

#### Returns

`boolean`
