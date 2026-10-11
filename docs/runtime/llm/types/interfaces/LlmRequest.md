[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/llm/types](../README.md) / LlmRequest

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

### mcpServers?

> `optional` **mcpServers?**: `Record`\<`string`, [`McpServerSpec`](../type-aliases/McpServerSpec.md)\>

#### Inherited from

[`LlmPrompt`](LlmPrompt.md).[`mcpServers`](LlmPrompt.md#mcpservers)

***

### model

> **model**: `string`

***

### onEvent?

> `optional` **onEvent?**: (`event`) => `void`

Receives progress and finished shell commands during write-mode runs.

#### Parameters

##### event

[`LlmEvent`](../type-aliases/LlmEvent.md)

#### Returns

`void`

#### Inherited from

[`LlmPrompt`](LlmPrompt.md).[`onEvent`](LlmPrompt.md#onevent)

***

### prompt

> **prompt**: `string`

#### Inherited from

[`LlmPrompt`](LlmPrompt.md).[`prompt`](LlmPrompt.md#prompt)

***

### resumeProviderSession?

> `optional` **resumeProviderSession?**: `string`

Continue this provider session instead of starting a new one.

#### Inherited from

[`LlmPrompt`](LlmPrompt.md).[`resumeProviderSession`](LlmPrompt.md#resumeprovidersession)

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

> **tools**: `"none"` \| `"read-only"` \| `"write"`

#### Inherited from

[`LlmPrompt`](LlmPrompt.md).[`tools`](LlmPrompt.md#tools)

***

### writeMode?

> `optional` **writeMode?**: [`WriteMode`](../../../../shared/types/type-aliases/WriteMode.md)

With `tools: "write"`: `auto` lets the CLI's own approval logic allow edits and commands, `full` skips approvals and sandboxing, `editsOnly` allows file edits without any shell. Default `auto`.

#### Inherited from

[`LlmPrompt`](LlmPrompt.md).[`writeMode`](LlmPrompt.md#writemode)
