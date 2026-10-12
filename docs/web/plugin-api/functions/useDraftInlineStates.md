[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / useDraftInlineStates

# Function: useDraftInlineStates()

> **useDraftInlineStates**(`inline`, `drafts`, `artifacts`): `void`

Opens each inline chat draft made after mount (its composer shows) and carries a draft's state to the thread it becomes once sent.

## Parameters

### inline

#### compact

`boolean`

#### move

(`from`, `to`) => `void`

#### set

(`id`, `state`) => `void`

#### setCompact

(`value`) => `void`

#### state

(`id`) => [`InlineState`](../type-aliases/InlineState.md) = `...`

### drafts

[`Draft`](../interfaces/Draft.md)[]

### artifacts

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<`unknown`\>[]

## Returns

`void`
