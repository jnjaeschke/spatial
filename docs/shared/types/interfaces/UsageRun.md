[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / UsageRun

# Interface: UsageRun

One LLM run: its tokens, `null` for a run recorded before tokens were metered, and its cost in USD, `null` when unknown (an unpriced model, or unmetered tokens without a reported cost). Item of `GET /api/usage`.

## Properties

### backend

> **backend**: [`LlmBackendId`](../type-aliases/LlmBackendId.md)

***

### costUsd

> **costUsd**: `number` \| `null`

***

### model

> **model**: `string`

***

### sessionId

> **sessionId**: `string`

***

### tokens

> **tokens**: \{ `cachedInput`: `number`; `input`: `number`; `output`: `number`; \} \| `null`

Input tokens, cached ones included.

***

### ts

> **ts**: `string`
