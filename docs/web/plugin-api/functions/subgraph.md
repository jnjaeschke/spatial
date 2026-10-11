[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / subgraph

# Function: subgraph()

> **subgraph**(`g`, `keep`): [`Graph`](../type-aliases/Graph.md)

`keep` plus every node anchored, directly or through other kept nodes, on a kept node, and the edges among them. Adds to `keep`.

## Parameters

### g

[`Graph`](../type-aliases/Graph.md)

### keep

`Set`\<`string`\>

## Returns

[`Graph`](../type-aliases/Graph.md)
