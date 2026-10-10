[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / DiffView

# Function: DiffView()

> **DiffView**(`__namedParameters`): `Element`

Read-only hunk. `nodrag nopan` lets users select text instead of moving the canvas.

## Parameters

### \_\_namedParameters

#### afterRow?

(`row`, `index`) => `ReactNode`

#### diffId

`string`

#### file

[`DiffFile`](../../../shared/types/interfaces/DiffFile.md)

#### hunk

[`Hunk`](../../../shared/types/interfaces/Hunk.md)

#### marks?

(`row`) => `object`[]

#### onMark?

(`mark`) => `void`

#### renderThread?

(`thread`) => `ReactNode`

#### rowClass?

(`row`) => `string` \| `undefined`

#### sessionId

`string`

#### threads?

[`HostedThread`](../type-aliases/HostedThread.md)[]

## Returns

`Element`
