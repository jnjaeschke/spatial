[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/review/shared/types](../README.md) / PhabCommentData

# Interface: PhabCommentData

A comment imported from Phabricator. Provenance is runtime verified; a newer version or done state revises the prior artifact. `bot` is set when the username ends in "bot": Phabricator roles do not distinguish bots.

## Properties

### author

> **author**: `string`

***

### body

> **body**: `string`

***

### bot

> **bot**: `boolean`

***

### dateCreated

> **dateCreated**: `number`

***

### diffId?

> `optional` **diffId?**: `number`

***

### done

> **done**: `boolean`

***

### isNewFile?

> `optional` **isNewFile?**: `boolean`

***

### length?

> `optional` **length?**: `number`

***

### line?

> `optional` **line?**: `number`

***

### own

> **own**: `boolean`

***

### path?

> `optional` **path?**: `string`

***

### phid

> **phid**: `string`

***

### quote?

> `optional` **quote?**: `string`

***

### replyTo?

> `optional` **replyTo?**: `string`

***

### revision

> **revision**: `number`

***

### txId

> **txId**: `number`

***

### version

> **version**: `number`
