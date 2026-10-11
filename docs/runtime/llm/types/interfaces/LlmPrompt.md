[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/llm/types](../README.md) / LlmPrompt

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

### onEvent?

> `optional` **onEvent?**: (`event`) => `void`

Receives progress and finished shell commands during write-mode runs.

#### Parameters

##### event

[`LlmEvent`](../type-aliases/LlmEvent.md)

#### Returns

`void`

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

> **tools**: `"none"` \| `"read-only"` \| `"write"`

***

### writeMode?

> `optional` **writeMode?**: [`WriteMode`](../../../../shared/types/type-aliases/WriteMode.md)

With `tools: "write"`: `auto` lets the CLI's own approval logic allow edits and commands, `full` skips approvals and sandboxing, `editsOnly` allows file edits without any shell. Default `auto`.
