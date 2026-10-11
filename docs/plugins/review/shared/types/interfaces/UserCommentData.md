[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/shared/types](../README.md) / UserCommentData

# Interface: UserCommentData

A user's inline comment on one side of a Diff. Later versions link back to the first artifact id. `replyTo` is the first artifact id of the `PhabComment` it answers; it is posted as an inline on `lines` like any other comment.

## Properties

### body

> **body**: `string`

***

### deleted

> **deleted**: `boolean`

***

### diffId

> **diffId**: `string`

***

### lines

> **lines**: [`LineRange`](LineRange.md)

***

### replaces

> **replaces**: `string` \| `null`

***

### replyTo

> **replyTo**: `string` \| `null`
