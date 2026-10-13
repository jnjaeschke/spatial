[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/create](../README.md) / corePlugin

# Variable: corePlugin

> `const` **corePlugin**: `object`

## Type Declaration

### artifactKinds

> **artifactKinds**: `object`

#### artifactKinds.CommandRun

> **CommandRun**: [`ArtifactKind`](../../plugins/interfaces/ArtifactKind.md) = `commandRunKind`

### id

> **id**: `string` = `"core"`

### tasks

> **tasks**: [`TaskDefinition`](../../tasks/interfaces/TaskDefinition.md)\<\{ `anchor?`: `string`; `aside?`: `boolean`; `lines?`: \{ `end`: `number`; `path`: `string`; `side`: `"new"` \| `"old"`; `start`: `number`; \}; `llm`: [`LlmSelection`](../../../shared/types/interfaces/LlmSelection.md); `quote?`: `string`; `text`: `string`; `threadId?`: `string`; \}, \{ `messageId`: `string`; `threadId`: `string`; \}\>[]
