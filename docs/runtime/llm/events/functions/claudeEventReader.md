[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/llm/events](../README.md) / claudeEventReader

# Function: claudeEventReader()

> **claudeEventReader**(`emit`, `now?`): (`line`) => `void`

Reads Claude `--output-format stream-json` lines: the `system/init` line is the session event. A tool result has no exit code field: an error result starts with `Exit code N`, else `is_error` decides 1 or 0.

## Parameters

### emit

(`event`) => `void`

### now?

() => `number`

## Returns

(`line`) => `void`
