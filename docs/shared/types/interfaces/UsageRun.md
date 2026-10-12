[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / UsageRun

# Interface: UsageRun

One metered LLM run: its tokens and its cost in USD, `null` when unknown (an unpriced model, or a run recorded before tokens were metered). Item of `GET /api/usage`.

## Properties

### backend

> **backend**: [`LlmBackendId`](../type-aliases/LlmBackendId.md)

***

### cachedInputTokens

> **cachedInputTokens**: `number`

***

### costUsd

> **costUsd**: `number` \| `null`

***

### inputTokens

> **inputTokens**: `number`

***

### model

> **model**: `string`

***

### outputTokens

> **outputTokens**: `number`

***

### sessionId

> **sessionId**: `string`

***

### ts

> **ts**: `string`
