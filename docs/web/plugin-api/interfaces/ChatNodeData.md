[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / ChatNodeData

# Interface: ChatNodeData

## Properties

### anchor

> **anchor**: `string`

***

### aside?

> `optional` **aside?**: `boolean`

***

### diagramsByMessage?

> `optional` **diagramsByMessage?**: `Record`\<`string`, `string`[]\>

Current review diagrams created by each assistant message.

***

### diffId

> **diffId**: `string`

***

### draftId

> **draftId**: `string` \| `null`

***

### foldsToQuote?

> `optional` **foldsToQuote?**: `boolean`

Collapsing the node leaves only a highlight of its quote.

***

### hunks

> **hunks**: `object`[]

#### file

> **file**: [`DiffFile`](../../../shared/types/interfaces/DiffFile.md)

#### hunk

> **hunk**: [`Hunk`](../../../shared/types/interfaces/Hunk.md)

***

### kind

> **kind**: `"chat"`

***

### lines?

> `optional` **lines?**: `object`

#### end

> **end**: `number`

#### path

> **path**: `string`

#### side

> **side**: `"new"` \| `"old"`

#### start

> **start**: `number`

***

### mcpRequests

> **mcpRequests**: `string`[]

***

### messages

> **messages**: [`Artifact`](../../../shared/types/interfaces/Artifact.md)\<[`ChatMessageData`](../../../shared/types/interfaces/ChatMessageData.md)\>[]

***

### quote?

> `optional` **quote?**: `string`

***

### revisions

> **revisions**: `Record`\<[`Id`](../../../shared/types/type-aliases/Id.md), [`RevisionData`](../../../shared/types/interfaces/RevisionData.md)[]\>

***

### taskId

> **taskId**: `string` \| `null`

Task of the turn that created the thread (or that the draft sent); later turns carry `threadId` in their input.

***

### threadId

> **threadId**: `string` \| `null`
