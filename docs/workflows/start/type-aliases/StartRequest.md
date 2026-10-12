[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [workflows/start](../README.md) / StartRequest

# Type Alias: StartRequest

> **StartRequest** = \{ `llm?`: [`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md); `path`: `string`; `text`: `string`; `writeMode?`: [`WriteMode`](../../../shared/types/type-aliases/WriteMode.md); \} \| \{ `answer`: `number` \| `string`; `question`: `string`; \}

A start box request: new text, or the answer to an open `StartQuestion` (an option index, or text when the question has no options).
