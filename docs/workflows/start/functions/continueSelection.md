[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [workflows/start](../README.md) / continueSelection

# Function: continueSelection()

> **continueSelection**(`rt`, `sessionId`, `question`, `answer`, `llm?`): `void`

Selects again with the user's answer to `question` appended to the request; continues in the background.

## Parameters

### rt

[`Runtime`](../../../runtime/tasks/classes/Runtime.md)

### sessionId

`string`

### question

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<[`SelectorQuestionData`](../../../shared/types/interfaces/SelectorQuestionData.md)\>

### answer

`string`

### llm?

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

## Returns

`void`
