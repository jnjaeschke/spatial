[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/structured](../README.md) / runStructured

# Function: runStructured()

> **runStructured**\<`T`\>(`llm`, `request`, `selection?`): `Promise`\<\{ `json`: `T`; `result`: [`LlmRunResult`](../../llm/types/interfaces/LlmRunResult.md); \}\>

Runs `request` and returns its checked reply; throws `<label> failed validation:` with the errors of the last attempt.

## Type Parameters

### T

`T`

## Parameters

### llm

#### run

### request

[`StructuredPrompt`](../interfaces/StructuredPrompt.md)

### selection?

[`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md)

## Returns

`Promise`\<\{ `json`: `T`; `result`: [`LlmRunResult`](../../llm/types/interfaces/LlmRunResult.md); \}\>
