[**spatial-ide**](../../../../README.md)

***

[spatial-ide](../../../../README.md) / [runtime/llm/events](../README.md) / codexEventReader

# Function: codexEventReader()

> **codexEventReader**(`emit`, `now?`): (`line`) => `void`

Reads Codex `exec --json` lines: `command_execution` items become command events, `file_change` items progress. `error` items are warnings and ignored.

## Parameters

### emit

(`event`) => `void`

### now?

() => `number`

## Returns

(`line`) => `void`
