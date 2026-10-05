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

### role

> **role**: `"user"` \| `"assistant"`

***

### text

> **text**: `string`
