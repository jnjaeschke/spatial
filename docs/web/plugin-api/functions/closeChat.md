[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / closeChat

# Function: closeChat()

> **closeChat**(`threadId`, `draftId`, `actions`, `closer`): `void`

Closing a chat box: an empty draft is discarded, anything else closes and can be reopened from its host.

## Parameters

### threadId

`string` \| `null`

### draftId

`string` \| `null`

### actions

[`ChatActions`](../interfaces/ChatActions.md) \| `null`

### closer

\{ `close`: `void`; \} \| `null`

## Returns

`void`
