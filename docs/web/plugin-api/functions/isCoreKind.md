[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / isCoreKind

# Function: isCoreKind()

> **isCoreKind**\<`K`\>(`data`, `kind`): data is Extract\<NoteNodeData, \{ kind: K \}\> \| Extract\<ChatNodeData, \{ kind: K \}\> \| Extract\<ConversationNodeData, \{ kind: K \}\> \| Extract\<DecisionNodeData, \{ kind: K \}\> \| Extract\<DiagramNodeData, \{ kind: K \}\>

Core node kind check.

## Type Parameters

### K

`K` *extends* `"note"` \| `"chat"` \| `"decision"` \| `"conversation"` \| `"diagram"`

## Parameters

### data

[`GraphNodeData`](../type-aliases/GraphNodeData.md)

### kind

`K`

## Returns

data is Extract\<NoteNodeData, \{ kind: K \}\> \| Extract\<ChatNodeData, \{ kind: K \}\> \| Extract\<ConversationNodeData, \{ kind: K \}\> \| Extract\<DecisionNodeData, \{ kind: K \}\> \| Extract\<DiagramNodeData, \{ kind: K \}\>
