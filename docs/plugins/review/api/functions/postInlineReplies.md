[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/review/api](../README.md) / postInlineReplies

# Function: postInlineReplies()

> **postInlineReplies**(`rt`, `sessionId`, `replies`, `opts?`): `Promise`\<\{ `posted`: `number`; `skipped`: `object`[]; \}\>

Creates a draft inline per reply on the commented line and records a `PostedReply`. Phabricator publishes drafts only when the user submits them; general comments have no draft replies.

## Parameters

### rt

`Pick`\<[`Runtime`](../../../../runtime/tasks/classes/Runtime.md), `"store"` \| `"putArtifact"` \| `"putLink"` \| `"emit"`\>

### sessionId

`string`

### replies

`object`[]

### opts?

#### makeConduit?

(`host`) => [`ConduitClient`](../../runtime/conduit/classes/ConduitClient.md)

## Returns

`Promise`\<\{ `posted`: `number`; `skipped`: `object`[]; \}\>
