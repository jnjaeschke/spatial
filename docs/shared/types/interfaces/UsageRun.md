[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / UsageRun

# Interface: UsageRun

One LLM run: its tokens, `null` when the run reported none (cancelled before the provider reported them, or recorded before tokens were metered), and its cost in USD, `null` when unknown (an unpriced model, or no tokens and no reported cost). Item of `GET /api/sessions/:id/usage`.

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
