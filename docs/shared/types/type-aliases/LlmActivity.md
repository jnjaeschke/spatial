[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / LlmActivity

# Type Alias: LlmActivity

> **LlmActivity** = \{ `kind`: `"text"`; `text`: `string`; \} \| \{ `kind`: `"thinking"`; `text`: `string`; \} \| \{ `detail`: `string`; `kind`: `"tool"`; `name`: `string`; \}

One step of an LLM run as its output streams: text it wrote, its reasoning, or a tool call with the argument that names what it works on. Payload of `task.activity` events.
