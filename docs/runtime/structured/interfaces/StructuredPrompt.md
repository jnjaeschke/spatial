[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/structured](../README.md) / StructuredPrompt

# Interface: StructuredPrompt

A structured LLM request. `validate` runs on replies that match `schema` (`attempt` counts from 0); an invalid reply is re-prompted with its errors up to `repairs` times (default 0). `label` names the reply in the final error.

## Extends

- [`LlmPrompt`](../../llm/types/interfaces/LlmPrompt.md)

## Properties

### cwd?

> `optional` **cwd?**: `string`

#### Inherited from

[`LlmPrompt`](../../llm/types/interfaces/LlmPrompt.md).[`cwd`](../../llm/types/interfaces/LlmPrompt.md#cwd)

***

### label

> **label**: `string`

***

### mcpServers?

> `optional` **mcpServers?**: `Record`\<`string`, [`McpServerSpec`](../../llm/types/type-aliases/McpServerSpec.md)\>

#### Inherited from

[`LlmPrompt`](../../llm/types/interfaces/LlmPrompt.md).[`mcpServers`](../../llm/types/interfaces/LlmPrompt.md#mcpservers)

***

### onEvent?

> `optional` **onEvent?**: (`event`) => `void`

Receives progress and finished shell commands during write-mode runs.

#### Parameters

##### event

[`LlmEvent`](../../llm/types/type-aliases/LlmEvent.md)

#### Returns

`void`

#### Inherited from

[`LlmPrompt`](../../llm/types/interfaces/LlmPrompt.md).[`onEvent`](../../llm/types/interfaces/LlmPrompt.md#onevent)

***

### prompt

> **prompt**: `string`

#### Inherited from

[`LlmPrompt`](../../llm/types/interfaces/LlmPrompt.md).[`prompt`](../../llm/types/interfaces/LlmPrompt.md#prompt)

***

### repairs?

> `optional` **repairs?**: `number`

***

### resumeProviderSession?

> `optional` **resumeProviderSession?**: `string`

Continue this provider session instead of starting a new one; a resumed write run keeps the write mode's tools and permissions.

#### Inherited from

[`LlmPrompt`](../../llm/types/interfaces/LlmPrompt.md).[`resumeProviderSession`](../../llm/types/interfaces/LlmPrompt.md#resumeprovidersession)

***

### schema

> **schema**: [`JsonSchema`](JsonSchema.md)

JSON schema for structured output. Must be OpenAI-strict compatible (additionalProperties: false, all properties required).

#### Overrides

[`LlmPrompt`](../../llm/types/interfaces/LlmPrompt.md).[`schema`](../../llm/types/interfaces/LlmPrompt.md#schema)

***

### system?

> `optional` **system?**: `string`

#### Inherited from

[`LlmPrompt`](../../llm/types/interfaces/LlmPrompt.md).[`system`](../../llm/types/interfaces/LlmPrompt.md#system)

***

### tools

> **tools**: `"none"` \| `"read-only"` \| `"write"`

#### Inherited from

[`LlmPrompt`](../../llm/types/interfaces/LlmPrompt.md).[`tools`](../../llm/types/interfaces/LlmPrompt.md#tools)

***

### writeMode?

> `optional` **writeMode?**: [`WriteMode`](../../../shared/types/type-aliases/WriteMode.md)

With `tools: "write"`: `auto` lets the CLI's own approval logic allow edits and commands, `full` skips approvals and sandboxing, `editsOnly` allows file edits without any shell. Default `auto`.

#### Inherited from

[`LlmPrompt`](../../llm/types/interfaces/LlmPrompt.md).[`writeMode`](../../llm/types/interfaces/LlmPrompt.md#writemode)

## Methods

### onRepair()?

> `optional` **onRepair**(`errors`): `void`

#### Parameters

##### errors

`string`[]

#### Returns

`void`

***

### validate()?

> `optional` **validate**(`json`, `attempt`): `string`[]

#### Parameters

##### json

`unknown`

##### attempt

`number`

#### Returns

`string`[]
