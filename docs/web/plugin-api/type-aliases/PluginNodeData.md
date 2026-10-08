[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [web/plugin-api](../README.md) / PluginNodeData

# Type Alias: PluginNodeData

> **PluginNodeData** = `object`

Data of a node kind a plugin registers. Core reads only the optional fields it documents:
`threads` (a `HostedThread[]` hosted inside the node), `quote` with `foldsToQuote`, and `closable`
(the node disappears while its id is closed).

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### kind

> **kind**: `string`
