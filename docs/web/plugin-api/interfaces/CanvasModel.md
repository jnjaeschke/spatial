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

### Provider?

> `optional` **Provider?**: `ComponentType`\<[`CanvasProviderProps`](CanvasProviderProps.md)\>

Wraps the canvas in the plugin's contexts.

***

### stack?

> `optional` **stack?**: `object`

Stacks (parallel lanes) lay out with `layout` instead of dagre and need a taller fit at patch zoom.

#### is()

> **is**(`graph`): `boolean`

##### Parameters

###### graph

[`Graph`](../type-aliases/Graph.md)

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

> `optional` **guide**(`graph`): [`GuideStep`](GuideStep.md)[]

The reading path of the guide bar and its `n`/`p`/`r` keys; none or empty shows no bar.

#### Parameters

##### graph

[`Graph`](../type-aliases/Graph.md)

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

### levelGraph()?

> `optional` **levelGraph**(`graph`, `level`): [`Graph`](../type-aliases/Graph.md)

The graph at a zoom level, for kinds that fold at low zoom.

#### Parameters

##### graph

[`Graph`](../type-aliases/Graph.md)

##### level

[`ZoomLevel`](../type-aliases/ZoomLevel.md)

#### Returns

[`Graph`](../type-aliases/Graph.md)

***

### revealWhenAdded()?

> `optional` **revealWhenAdded**(`node`): `boolean`

Nodes to center when they first appear after the canvas has loaded (a freshly generated diagram).

#### Parameters

##### node

[`GraphNode`](GraphNode.md)

#### Returns

`boolean`
