[**spatial-ide**](../../../../README.md)

***

[spatial-ide](../../../../README.md) / [plugins/review/api](../README.md) / verifyDiagramAtBase

# Function: verifyDiagramAtBase()

> **verifyDiagramAtBase**(`proposal`, `baseSha`, `show`): `Promise`\<\{ `data`: [`DiagramData`](../../../../shared/types/interfaces/DiagramData.md); `ok`: `true`; \} \| \{ `error`: `string`; `ok`: `false`; \}\>

Verifies a sequence proposal about code that exists at `baseSha` (a plan, not a commit range): the base is the only commit, so every citation is read at `baseSha` and `proposal.commit` must be 1.

## Parameters

### proposal

`unknown`

### baseSha

`string`

### show

(`sha`, `path`) => `Promise`\<`string`\>

## Returns

`Promise`\<\{ `data`: [`DiagramData`](../../../../shared/types/interfaces/DiagramData.md); `ok`: `true`; \} \| \{ `error`: `string`; `ok`: `false`; \}\>
