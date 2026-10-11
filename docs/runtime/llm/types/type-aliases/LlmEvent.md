[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/llm/types](../README.md) / LlmEvent

# Type Alias: LlmEvent

> **LlmEvent** = \{ `kind`: `"progress"`; `message`: `string`; \} \| \{ `command`: `string`; `durationMs`: `number`; `exitCode`: `number`; `kind`: `"command"`; `output`: `string`; \}

Progress and finished shell commands of a write-mode run; `output` is capped at 256 KB.
