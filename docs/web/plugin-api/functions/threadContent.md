[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / threadContent

# Function: threadContent()

> **threadContent**(`state`, `thread`, `diagramsByMessage?`): `object`

Chat content of a thread; the conversation node of a session start; notes and chats added to a root graph.

## Parameters

### state

[`SessionState`](../../../shared/types/interfaces/SessionState.md)

### thread

[`Artifact`](../../../shared/types/interfaces/Artifact.md)\<[`ChatThreadData`](../../../shared/types/interfaces/ChatThreadData.md)\>

### diagramsByMessage?

`Record`\<`string`, `string`[]\>

## Returns

`object`

### diagramsByMessage?

> `optional` **diagramsByMessage?**: `Record`\<`string`, `string`[]\>

### mcpRequests

> **mcpRequests**: `string`[]

### messages

> **messages**: [`Artifact`](../../../shared/types/interfaces/Artifact.md)\<[`ChatMessageData`](../../../shared/types/interfaces/ChatMessageData.md)\>[]

### revisions

> **revisions**: `object`

#### Index Signature

\[`k`: `string`\]: [`RevisionData`](../../../shared/types/interfaces/RevisionData.md)[]

### taskId

> **taskId**: `string`

### threadId

> **threadId**: `string` = `thread.id`
