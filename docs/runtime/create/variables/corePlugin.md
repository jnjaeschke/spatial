[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/create](../README.md) / corePlugin

# Variable: corePlugin

> `const` **corePlugin**: `object`

## Type Declaration

### id

> **id**: `string` = `"core"`

### tasks

> **tasks**: ([`TaskDefinition`](../../tasks/interfaces/TaskDefinition.md)\<\{ `llm?`: [`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md); `prompt`: `string`; `round?`: `number`; `writeMode?`: [`WriteMode`](../../../shared/types/type-aliases/WriteMode.md); \}, \{ `startId`: `string`; \} \| \{ `questionId`: `string`; \}\> \| [`TaskDefinition`](../../tasks/interfaces/TaskDefinition.md)\<\{ `anchor?`: `string`; `aside?`: `boolean`; `lines?`: \{ `end`: `number`; `path`: `string`; `side`: `"new"` \| `"old"`; `start`: `number`; \}; `llm`: [`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md); `quote?`: `string`; `text`: `string`; `threadId?`: `string`; \}, \{ `messageId`: `string`; `threadId`: `string`; \}\>)[]
