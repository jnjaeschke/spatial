[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/workflow/narrate-patch](../README.md) / narrateRound

# Function: narrateRound()

> **narrateRound**(`rt`, `sessionId`, `diffId`, `llm?`): `Promise`\<`void`\>

Narration of a Diff without a review: introducedSymbols, narrate (update mode against the newest narrated earlier Diff), carryFindings in update mode, resolveSpecRefs.

## Parameters

### rt

[`Runtime`](../../../../../runtime/tasks/classes/Runtime.md)

### sessionId

`string`

### diffId

`string`

### llm?

[`LlmSelection`](../../../../../shared/types/interfaces/LlmSelection.md)

## Returns

`Promise`\<`void`\>
