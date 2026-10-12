[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/llm/types](../README.md) / LlmEvent

# Type Alias: LlmEvent

> **LlmEvent** = \{ `kind`: `"progress"`; `message`: `string`; \} \| \{ `command`: `string`; `durationMs`: `number`; `exitCode`: `number`; `kind`: `"command"`; `output`: `string`; \} \| \{ `kind`: `"session"`; `providerSessionId`: `string`; \}

Progress, finished shell commands and the provider session id of a write-mode run, in stream order; `session` comes first, as soon as the stream shows the id. `output` is capped at 256 KB.
