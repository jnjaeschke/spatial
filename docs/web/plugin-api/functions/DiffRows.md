[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / DiffRows

# Function: DiffRows()

> **DiffRows**(`__namedParameters`): `Element`

Renders numbered diff rows and optional content inserted after each row.

## Parameters

### \_\_namedParameters

#### afterRow?

(`row`, `index`) => `ReactNode`

#### diffId?

`string`

#### hunkId?

`string`

#### marks?

(`row`) => [`RowMark`](../interfaces/RowMark.md)[]

#### oldHref?

(`line`) => `string`

#### onMark?

(`mark`, `rect`) => `void`

#### onMarkHover?

(`mark`, `rect`) => `void`

#### onRowClick?

(`row`) => `void`

#### path

`string`

#### rowClass?

(`row`) => `string` \| `undefined`

#### rows

[`Row`](../../../plugin-api/type-aliases/Row.md)[]

## Returns

`Element`
