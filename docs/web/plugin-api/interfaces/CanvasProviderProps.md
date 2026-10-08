[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / CanvasProviderProps

# Interface: CanvasProviderProps

## Properties

### children

> **children**: `ReactNode`

***

### graph

> **graph**: [`Graph`](../type-aliases/Graph.md)

The graph as shown: after layers and closed nodes, before collapsing and zoom level.

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

> **reveal**(`nodeId`, `collapseId`): `void`

Expands the collapse id, centers the node (leaving the zoom level for code), and records the jump in the view history.

#### Parameters

##### nodeId

`string`

##### collapseId

`string`

#### Returns

`void`
