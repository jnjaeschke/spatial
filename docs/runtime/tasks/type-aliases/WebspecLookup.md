[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/tasks](../README.md) / WebspecLookup

# Type Alias: WebspecLookup

> **WebspecLookup** = \{ `command`: `"query"`; `ref`: `string`; `steps`: `string` \| `null`; \} \| \{ `command`: `"refs"`; `direction`: `"incoming"` \| `"outgoing"`; `limit`: `number`; `ref`: `string`; \} \| \{ `command`: `"effects"`; `ref`: `string`; `step`: `string` \| `null`; \} \| \{ `command`: `"flow"`; `ref`: `string`; \} \| \{ `command`: `"state"`; `selector`: `string`; \}

A read-only webspec-index lookup whose text output goes to an LLM tool.
