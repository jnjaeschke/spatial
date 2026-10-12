[**spatial**](../../README.md)

***

[spatial](../../README.md) / [plugin-api](../README.md) / chosenDecision

# Function: chosenDecision()

> **chosenDecision**(`view`, `epoch`, `key`): \{ `by`: `"user"` \| `"rule"`; `llm?`: [`LlmSelection`](../../shared/types/interfaces/LlmSelection.md); `option`: `string`; `reason?`: `string`; `text?`: `string`; \} \| `null`

The answer of the latest answered Decision with `key` stamped with `epoch`, or null.

## Parameters

### view

#### artifacts

[`Artifact`](../../shared/types/interfaces/Artifact.md)\<`unknown`\>[]

### epoch

`number`

### key

`string`

## Returns

\{ `by`: `"user"` \| `"rule"`; `llm?`: [`LlmSelection`](../../shared/types/interfaces/LlmSelection.md); `option`: `string`; `reason?`: `string`; `text?`: `string`; \} \| `null`
