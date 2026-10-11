[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / PluginNodeData

# Type Alias: PluginNodeData

> **PluginNodeData** = `object`

Data of a node kind a plugin registers. Core reads only the optional fields it documents:
`threads` (a `HostedThread[]` hosted inside the node), `quote` with `foldsToQuote`, `closable`
(the node disappears while its id is closed), `movable` (dragged positions persist as free positions),
and `reopenOn` (with `closable`, the node that offers this closed node for reopening).

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### kind

> **kind**: `string`
