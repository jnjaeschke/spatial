[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / CanvasProviderProps

# Interface: CanvasProviderProps

## Properties

### children

> **children**: `ReactNode`

***

### graph

> **graph**: [`Graph`](../type-aliases/Graph.md)

The graph as shown: after layers and closed nodes, before places and collapsing.

***

### readOnly

> **readOnly**: `boolean`

No server behind the view (a past epoch or a static export): nothing may be requested.

***

### state

> **state**: [`SessionState`](../../../shared/types/interfaces/SessionState.md)

## Methods

### focusRow()

> **focusRow**(`row`): `void`

Highlights a diff row and scrolls it into view.

#### Parameters

##### row

[`FocusedRow`](FocusedRow.md)

#### Returns

`void`

***

### reveal()

> **reveal**(`nodeId`, `collapseId`, `place?`): `void`

Expands the collapse id, centers the node (first switching to `place` when given), and records the jump in the view history.

#### Parameters

##### nodeId

`string`

##### collapseId

`string`

##### place?

`string`

#### Returns

`void`
