[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/plugins](../README.md) / McpToolContext

# Interface: McpToolContext

What a plugin MCP tool may use: the session, its work tree, read-only capabilities and the call's abort signal.

## Properties

### codeSearch

> **codeSearch**: `Record`\<[`Engine`](../../../shared/types/type-aliases/Engine.md), [`CodeSearch`](../../code-search/interfaces/CodeSearch.md)\>

***

### knowledge

> **knowledge**: `Pick`\<[`Knowledge`](../../knowledge/interfaces/Knowledge.md), `"get"` \| `"list"`\>

***

### repo

> **repo**: `string`

***

### sessionId

> **sessionId**: `string`

***

### signal

> **signal**: `AbortSignal`

***

### webspec

> **webspec**: [`WebspecCapability`](../../tasks/interfaces/WebspecCapability.md)
