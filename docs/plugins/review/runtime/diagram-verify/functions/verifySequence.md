[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/review/runtime/diagram-verify](../README.md) / verifySequence

# Function: verifySequence()

> **verifySequence**(`proposal`, `diff`, `show`): `Promise`\<\{ `data`: [`DiagramData`](../../../../../shared/types/interfaces/DiagramData.md); `ok`: `true`; \} \| \{ `error`: `string`; `ok`: `false`; \}\>

Checks sequence citations against the commit tree and its parent flow.

## Parameters

### proposal

[`SequenceProposal`](../type-aliases/SequenceProposal.md)

### diff

`Pick`\<[`DiffData`](../../../../../shared/types/interfaces/DiffData.md), `"baseSha"` \| `"commits"`\>

### show

(`sha`, `path`) => `Promise`\<`string`\>

## Returns

`Promise`\<\{ `data`: [`DiagramData`](../../../../../shared/types/interfaces/DiagramData.md); `ok`: `true`; \} \| \{ `error`: `string`; `ok`: `false`; \}\>
