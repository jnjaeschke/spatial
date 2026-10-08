[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/review/runtime/phab-transactions](../README.md) / storeRemoteComments

# Function: storeRemoteComments()

> **storeRemoteComments**(`store`, `sessionId`, `revision`, `comments`, `authors`, `own`): [`Artifact`](../../../../../shared/types/interfaces/Artifact.md)\<[`PhabCommentData`](../../../../../shared/types/interfaces/PhabCommentData.md)\>[]

Stores new, edited, and done-toggled remote comments idempotently.

## Parameters

### store

[`Store`](../../../../../runtime/store/classes/Store.md)

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

[`Artifact`](../../../../../shared/types/interfaces/Artifact.md)\<[`PhabCommentData`](../../../../../shared/types/interfaces/PhabCommentData.md)\>[]
