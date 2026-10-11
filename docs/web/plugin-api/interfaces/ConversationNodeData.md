[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / ConversationNodeData

# Interface: ConversationNodeData

## Extends

- `Pick`\<[`ChatNodeData`](ChatNodeData.md), `"anchor"` \| `"diffId"` \| `"hunks"` \| `"threadId"` \| `"draftId"` \| `"taskId"` \| `"messages"` \| `"revisions"` \| `"mcpRequests"` \| `"diagramsByMessage"`\>

## Properties

### anchor

> **anchor**: `string`

#### Inherited from

[`ChatNodeData`](ChatNodeData.md).[`anchor`](ChatNodeData.md#anchor)

***

### diagramsByMessage?

> `optional` **diagramsByMessage?**: `Record`\<`string`, `string`[]\>

Current review diagrams created by each assistant message.

#### Inherited from

[`ChatNodeData`](ChatNodeData.md).[`diagramsByMessage`](ChatNodeData.md#diagramsbymessage)

***

### diffId

> **diffId**: `string`

#### Inherited from

[`ChatNodeData`](ChatNodeData.md).[`diffId`](ChatNodeData.md#diffid)

***

### draftId

> **draftId**: `string` \| `null`

#### Inherited from

[`ChatNodeData`](ChatNodeData.md).[`draftId`](ChatNodeData.md#draftid)

***

### hunks

> **hunks**: `object`[]

#### file

> **file**: [`DiffFile`](../../../shared/types/interfaces/DiffFile.md)

#### hunk

> **hunk**: [`Hunk`](../../../shared/types/interfaces/Hunk.md)

#### Inherited from

[`ChatNodeData`](ChatNodeData.md).[`hunks`](ChatNodeData.md#hunks)

***

### kind

> **kind**: `"conversation"`

***

### mcpRequests

> **mcpRequests**: `string`[]

#### Inherited from

[`ChatNodeData`](ChatNodeData.md).[`mcpRequests`](ChatNodeData.md#mcprequests)

***

### messages

> **messages**: [`Artifact`](../../../shared/types/interfaces/Artifact.md)\<[`ChatMessageData`](../../../shared/types/interfaces/ChatMessageData.md)\>[]

#### Inherited from

[`ChatNodeData`](ChatNodeData.md).[`messages`](ChatNodeData.md#messages)

***

### prompt

> **prompt**: `string`

The request; shown until the first turn has created the thread.

***

### revisions

> **revisions**: `Record`\<[`Id`](../../../shared/types/type-aliases/Id.md), [`RevisionData`](../../../shared/types/interfaces/RevisionData.md)[]\>

#### Inherited from

[`ChatNodeData`](ChatNodeData.md).[`revisions`](ChatNodeData.md#revisions)

***

### taskId

> **taskId**: `string` \| `null`

Task of the turn that created the thread (or that the draft sent); later turns carry `threadId` in their input.

#### Inherited from

[`ChatNodeData`](ChatNodeData.md).[`taskId`](ChatNodeData.md#taskid)

***

### threadId

> **threadId**: `string` \| `null`

#### Inherited from

[`ChatNodeData`](ChatNodeData.md).[`threadId`](ChatNodeData.md#threadid)

***

### title

> **title**: `string`
