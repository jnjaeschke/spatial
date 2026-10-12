[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/llm/events](../README.md) / codexEventReader

# Function: codexEventReader()

> **codexEventReader**(`emit`, `now?`, `structured?`): (`line`) => `void`

Reads Codex `exec --json` lines: `thread.started` is the session event, `command_execution` items become command events, `file_change` items progress. Messages, reasoning, commands, file changes, MCP calls and web searches are activity. `error` items are warnings and ignored. With `structured` (an `--output-schema` run) the turn's last agent message is the answer, so each message is held until another item shows it was not the last.

## Parameters

### emit

(`event`) => `void`

### now?

() => `number`

### structured?

`boolean` = `false`

## Returns

(`line`) => `void`
