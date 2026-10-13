[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/create](../README.md) / sessionServerSpec

# Function: sessionServerSpec()

> **sessionServerSpec**(`dbPath`, `sessionId`): [`McpServerSpec`](../../llm/types/type-aliases/McpServerSpec.md)

The session MCP server: a stdio child reading the session database. It builds the plugin services from its environment, so the `SPATIAL_<TOOL>_BIN` variables set here are forwarded to it.

## Parameters

### dbPath

`string`

### sessionId

`string`

## Returns

[`McpServerSpec`](../../llm/types/type-aliases/McpServerSpec.md)
