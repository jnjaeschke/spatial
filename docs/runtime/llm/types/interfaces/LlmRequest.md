[**spatial-ide**](../../../../README.md)

***

[spatial-ide](../../../../README.md) / [runtime/llm/types](../README.md) / LlmRequest

# Interface: LlmRequest

What a task asks of an LLM; model/effort are resolved by the LLM manager.

## Extends

- [`LlmPrompt`](LlmPrompt.md)

## Properties

### cwd?

> `optional` **cwd?**: `string`

#### Inherited from

[`LlmPrompt`](LlmPrompt.md).[`cwd`](LlmPrompt.md#cwd)

***

### effort

> **effort**: `string`

***

### model

> **model**: `string`

***

### prompt

> **prompt**: `string`

#### Inherited from

[`LlmPrompt`](LlmPrompt.md).[`prompt`](LlmPrompt.md#prompt)

***

### schema?

> `optional` **schema?**: `object`

JSON schema for structured output. Must be OpenAI-strict compatible (additionalProperties: false, all properties required).

#### Inherited from

[`LlmPrompt`](LlmPrompt.md).[`schema`](LlmPrompt.md#schema)

***

### signal

> **signal**: `AbortSignal`

***

### system?

> `optional` **system?**: `string`

#### Inherited from

[`LlmPrompt`](LlmPrompt.md).[`system`](LlmPrompt.md#system)

***

### tools

> **tools**: `"none"` \| `"read-only"`

#### Inherited from

[`LlmPrompt`](LlmPrompt.md).[`tools`](LlmPrompt.md#tools)
