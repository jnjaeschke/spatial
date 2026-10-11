[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/llm/types](../README.md) / LlmRunResult

# Interface: LlmRunResult

## Extends

- [`LlmResult`](LlmResult.md)

## Properties

### json?

> `optional` **json?**: `unknown`

Parsed structured output; present iff a schema was given.

#### Inherited from

[`LlmResult`](LlmResult.md).[`json`](LlmResult.md#json)

***

### providerSessionId

> **providerSessionId**: `string`

#### Inherited from

[`LlmResult`](LlmResult.md).[`providerSessionId`](LlmResult.md#providersessionid)

***

### selection

> **selection**: [`LlmSelection`](../../../../shared/types/interfaces/LlmSelection.md)

***

### text

> **text**: `string`

#### Inherited from

[`LlmResult`](LlmResult.md).[`text`](LlmResult.md#text)

***

### usage?

> `optional` **usage?**: [`LlmUsage`](LlmUsage.md)

#### Inherited from

[`LlmResult`](LlmResult.md).[`usage`](LlmResult.md#usage)
