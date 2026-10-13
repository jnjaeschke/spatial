[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/plugins](../README.md) / McpToolContext

# Interface: McpToolContext

What a plugin MCP tool may use: the session, its work tree, the plugins' services, read-only knowledge and the call's abort signal.

## Properties

### knowledge

> **knowledge**: `Pick`\<[`Knowledge`](../../knowledge/interfaces/Knowledge.md), `"get"`\>

***

### repo

> **repo**: `string`

***

### services

> **services**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

***

### sessionId

> **sessionId**: `string`

***

### signal

> **signal**: `AbortSignal`
