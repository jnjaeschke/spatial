[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / DiffRows

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

#### oldHref?

(`line`) => `string`

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
