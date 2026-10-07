[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [workflows/narrate-patch](../README.md) / narratePatch

# Function: narratePatch()

> **narratePatch**(`rt`, `sessionId`, `opts`): `Promise`\<\{ `diffId`: `string`; `narrativeId`: `string`; \}\>

importDiff → narrate → resolveSpecRefs → review, with mapSpecSteps for each spec section with steps alongside the review. Plain orchestration; no workflow engine.

## Parameters

### rt

[`Runtime`](../../../runtime/tasks/classes/Runtime.md)

### sessionId

`string`

### opts

\{ `base`: `string`; `head`: `string`; `llm?`: [`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md); \} \| \{ `diffId`: `string`; `llm?`: [`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md); \}

## Returns

`Promise`\<\{ `diffId`: `string`; `narrativeId`: `string`; \}\>
