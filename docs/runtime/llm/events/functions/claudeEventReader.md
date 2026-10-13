[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/llm/events](../README.md) / claudeEventReader

# Function: claudeEventReader()

> **claudeEventReader**(`emit`, `now?`): (`line`) => `void`

Reads Claude `--output-format stream-json` lines: the `system/init` line is the session event; assistant text, thinking and tool calls (except `StructuredOutput`, the run's answer) are activity. A tool result has no exit code field: an error result starts with `Exit code N`, else `is_error` decides 1 or 0. Each `result` is usage: a live-input run has one per answered message, whose tokens cover that answer while `total_cost_usd` covers the run so far.

## Parameters

### emit

(`event`) => `void`

### now?

() => `number`

## Returns

(`line`) => `void`
