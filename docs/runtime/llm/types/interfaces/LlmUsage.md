[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/llm/types](../README.md) / LlmUsage

# Interface: LlmUsage

## Properties

### cachedInputTokens

> **cachedInputTokens**: `number`

The share of `inputTokens` read from the provider's prompt cache.

***

### costUsd?

> `optional` **costUsd?**: `number`

The run's cost as the provider reports it; codex reports none.

***

### cumulative

> **cumulative**: `boolean`

The counts cover the provider session so far (codex), not this run alone (claude).

***

### inputTokens

> **inputTokens**: `number`

All input tokens, cached ones included.

***

### outputTokens

> **outputTokens**: `number`
