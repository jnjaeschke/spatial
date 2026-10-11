[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / ChatMessageData

# Interface: ChatMessageData

Data of a `ChatMessage` artifact; linked `reply → thread`. Assistant messages record the provider session they belong to. `run`: a phase the reply asked to start after the turn; anything with outside effects still waits for the user's decision in that phase.

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

### run?

> `optional` **run?**: `object`

#### input

> **input**: `unknown`

#### phase

> **phase**: `string`

***

### text

> **text**: `string`
