[**spatial-ide**](../../../../README.md)

***

[spatial-ide](../../../../README.md) / [runtime/llm/types](../README.md) / LlmPrompt

# Interface: LlmPrompt

What a task asks of an LLM; model/effort are resolved by the LLM manager.

## Extended by

- [`LlmRequest`](LlmRequest.md)

## Properties

### cwd?

> `optional` **cwd?**: `string`

***

### mcpServers?

> `optional` **mcpServers?**: `Record`\<`string`, [`McpServerSpec`](../type-aliases/McpServerSpec.md)\>

***

### prompt

> **prompt**: `string`

***

### resumeProviderSession?

> `optional` **resumeProviderSession?**: `string`

Continue this provider session instead of starting a new one.

***

### schema?

> `optional` **schema?**: `object`

JSON schema for structured output. Must be OpenAI-strict compatible (additionalProperties: false, all properties required).

***

### system?

> `optional` **system?**: `string`

***

### tools

> **tools**: `"none"` \| `"read-only"`
