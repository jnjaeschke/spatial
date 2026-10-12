[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/workflow/narrate-patch](../README.md) / narrateDiff

# Function: narrateDiff()

> **narrateDiff**(`rt`, `sessionId`, `diffId`, `llm?`, `recheck?`): `Promise`\<`void`\>

narrate → (carryFindings) → resolveSpecRefs → review for an imported Diff, with introducedSymbols, mapSpecSteps for each spec section with steps and, in Gecko repos, fetchBugs → summarizeBug alongside the review.

## Parameters

### rt

[`Runtime`](../../../../../runtime/tasks/classes/Runtime.md)

### sessionId

`string`

### diffId

`string`

### llm?

[`LlmSelection`](../../../../../shared/types/interfaces/LlmSelection.md)

### recheck?

`string`[]

## Returns

`Promise`\<`void`\>
