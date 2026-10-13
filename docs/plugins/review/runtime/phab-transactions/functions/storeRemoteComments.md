[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/runtime/phab-transactions](../README.md) / storeRemoteComments

# Function: storeRemoteComments()

> **storeRemoteComments**(`rt`, `sessionId`, `revision`, `comments`, `authors`, `own`): [`Artifact`](../../../../../shared/types/interfaces/Artifact.md)\<[`PhabCommentData`](../../../shared/types/interfaces/PhabCommentData.md)\>[]

Stores new, edited, and done-toggled remote comments idempotently.

## Parameters

### rt

`Pick`\<[`Runtime`](../../../../../runtime/tasks/classes/Runtime.md), `"store"` \| `"putArtifact"` \| `"putLink"`\>

### sessionId

`string`

### revision

`number`

### comments

[`RemoteComment`](../interfaces/RemoteComment.md)[]

### authors

`Map`\<`string`, `string`\>

### own

#### phid

`string`

#### posted

`object`[]

## Returns

[`Artifact`](../../../../../shared/types/interfaces/Artifact.md)\<[`PhabCommentData`](../../../shared/types/interfaces/PhabCommentData.md)\>[]
