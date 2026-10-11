[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/diagram](../README.md) / verifySequence

# Function: verifySequence()

> **verifySequence**(`proposal`, `source`, `show`): `Promise`\<\{ `data`: [`DiagramData`](../../../shared/types/interfaces/DiagramData.md); `ok`: `true`; \} \| \{ `error`: `string`; `ok`: `false`; \}\>

Checks sequence citations against the commit tree and its parent flow; `source` gives the commits and their base.

## Parameters

### proposal

[`SequenceProposal`](../type-aliases/SequenceProposal.md)

### source

`Pick`\<[`DiffData`](../../../shared/types/interfaces/DiffData.md), `"baseSha"` \| `"commits"`\>

### show

(`sha`, `path`) => `Promise`\<`string`\>

## Returns

`Promise`\<\{ `data`: [`DiagramData`](../../../shared/types/interfaces/DiagramData.md); `ok`: `true`; \} \| \{ `error`: `string`; `ok`: `false`; \}\>
