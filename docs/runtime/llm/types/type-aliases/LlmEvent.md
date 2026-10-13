[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/llm/types](../README.md) / LlmEvent

# Type Alias: LlmEvent

> **LlmEvent** = \{ `kind`: `"progress"`; `message`: `string`; \} \| \{ `callId?`: `string`; `command`: `string`; `durationMs`: `number`; `exitCode`: `number`; `kind`: `"command"`; `output`: `string`; \} \| \{ `activity`: [`LlmActivity`](../../../../shared/types/type-aliases/LlmActivity.md); `kind`: `"activity"`; \} \| \{ `kind`: `"usage"`; `usage`: [`LlmUsage`](../interfaces/LlmUsage.md); \} \| \{ `kind`: `"session"`; `providerSessionId`: `string`; \}

Progress, finished shell commands, activity, usage and the provider session id of a run, in stream order; `session` comes first, as soon as the stream shows the id. `output` is capped at 256 KB. Each `usage` replaces the previous one; it also arrives for a run that then fails or is cancelled.
