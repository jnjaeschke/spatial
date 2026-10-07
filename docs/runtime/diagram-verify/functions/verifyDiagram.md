[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/diagram-verify](../README.md) / verifyDiagram

# Function: verifyDiagram()

> **verifyDiagram**(`proposal`, `diff`, `show`): `Promise`\<\{ `data`: [`DiagramData`](../../../shared/types/interfaces/DiagramData.md); `ok`: `true`; \} \| \{ `error`: `string`; `ok`: `false`; \}\>

Checks every citation of a proposed diagram against the commit's tree (parent's for removed nodes).

## Parameters

### proposal

[`DiagramProposal`](../type-aliases/DiagramProposal.md)

### diff

`Pick`\<[`DiffData`](../../../shared/types/interfaces/DiffData.md), `"baseSha"` \| `"commits"`\>

### show

(`sha`, `path`) => `Promise`\<`string`\>

## Returns

`Promise`\<\{ `data`: [`DiagramData`](../../../shared/types/interfaces/DiagramData.md); `ok`: `true`; \} \| \{ `error`: `string`; `ok`: `false`; \}\>
