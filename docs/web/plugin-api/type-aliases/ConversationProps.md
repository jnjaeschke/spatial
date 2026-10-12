[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / ConversationProps

# Type Alias: ConversationProps

> **ConversationProps** = `Pick`\<[`ChatNodeData`](../interfaces/ChatNodeData.md), `"anchor"` \| `"quote"` \| `"lines"` \| `"diffId"` \| `"hunks"` \| `"threadId"` \| `"draftId"` \| `"taskId"` \| `"messages"` \| `"revisions"` \| `"mcpRequests"` \| `"diagramsByMessage"` \| `"aside"`\> & `object`

## Type Declaration

### canSteer?

> `optional` **canSteer?**: `boolean`

### decision?

> `optional` **decision?**: [`Artifact`](../../../shared/types/interfaces/Artifact.md)\<[`DecisionData`](../../../shared/types/interfaces/DecisionData.md)\> \| `null`

### items?

> `optional` **items?**: [`Artifact`](../../../shared/types/interfaces/Artifact.md)[]

### lead?

> `optional` **lead?**: `ReactNode`

### renderItem()?

> `optional` **renderItem**(`artifact`): `ReactNode`

#### Parameters

##### artifact

[`Artifact`](../../../shared/types/interfaces/Artifact.md)

#### Returns

`ReactNode`
