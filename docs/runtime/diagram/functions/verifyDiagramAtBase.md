[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/diagram](../README.md) / verifyDiagramAtBase

# Function: verifyDiagramAtBase()

> **verifyDiagramAtBase**(`proposal`, `baseSha`, `show`): `Promise`\<\{ `data`: [`DiagramData`](../../../shared/types/interfaces/DiagramData.md); `ok`: `true`; \} \| \{ `error`: `string`; `ok`: `false`; \}\>

Verifies a sequence proposal about code at `baseSha`, where the base is the only commit.

## Parameters

### proposal

`unknown`

### baseSha

`string`

### show

(`sha`, `path`) => `Promise`\<`string`\>

## Returns

`Promise`\<\{ `data`: [`DiagramData`](../../../shared/types/interfaces/DiagramData.md); `ok`: `true`; \} \| \{ `error`: `string`; `ok`: `false`; \}\>
