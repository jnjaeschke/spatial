[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/plugins](../README.md) / PluginServer

# Interface: PluginServer

Server routes and services of a plugin, built once per HTTP server.

## Properties

### routes?

> `optional` **routes?**: [`Route`](../../../server/http/type-aliases/Route.md)[]

## Methods

### start()?

> `optional` **start**(): `void`

Starts background services. Only server processes call it.

#### Returns

`void`

***

### watch()?

> `optional` **watch**(`sessionId`): () => `void`

Called while a client streams session events; returns its unwatch function.

#### Parameters

##### sessionId

`string`

#### Returns

() => `void`
