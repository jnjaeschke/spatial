[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / DiffView

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

(`mark`, `rect`) => `void`

#### onMarkHover?

(`mark`, `rect`) => `void`

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
