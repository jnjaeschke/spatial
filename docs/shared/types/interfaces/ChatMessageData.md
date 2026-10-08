[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/types](../README.md) / ChatMessageData

# Interface: ChatMessageData

Data of a `ChatMessage` artifact; linked `reply → thread`. Assistant messages record the provider session they belong to.

## Properties

### llm?

> `optional` **llm?**: [`LlmSelection`](LlmSelection.md)

***

### providerSessionId?

> `optional` **providerSessionId?**: `string`

***

### questions?

> `optional` **questions?**: `string`[]

Questions the assistant asks the user.

***

### replyErrors?

> `optional` **replyErrors?**: `object`[]

Why a plugin-proposed artifact was dropped during deterministic validation.

#### error

> **error**: `string`

#### label

> **label**: `string`

***

### revisionErrors?

> `optional` **revisionErrors?**: `string`[]

Revisions from this reply that were not applied, with the reason.

***

### role

> **role**: `"user"` \| `"assistant"`

***

### text

> **text**: `string`
