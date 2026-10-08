[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/review/workflow/narrate-patch](../README.md) / narrateDiff

# Function: narrateDiff()

> **narrateDiff**(`rt`, `sessionId`, `diffId`, `llm?`): `Promise`\<`void`\>

narrate → (carryFindings) → resolveSpecRefs → review for an imported Diff, with mapSpecSteps for each spec section with steps alongside the review.

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
