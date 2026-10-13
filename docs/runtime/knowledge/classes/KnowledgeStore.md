[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/knowledge](../README.md) / KnowledgeStore

# Class: KnowledgeStore

`Knowledge` in its own SQLite file, apart from the session database. Read-only stores (the session MCP server) only read; the file must exist.

## Implements

- [`Knowledge`](../interfaces/Knowledge.md)

## Constructors

### Constructor

> **new KnowledgeStore**(`path`, `opts?`): `KnowledgeStore`

#### Parameters

##### path

`string`

##### opts?

###### readOnly?

`boolean`

#### Returns

`KnowledgeStore`

## Methods

### close()

> **close**(): `void`

#### Returns

`void`

***

### get()

> **get**(`scope`, `namespace`, `key`): [`KnowledgeRead`](../type-aliases/KnowledgeRead.md)

#### Parameters

##### scope

`string`

##### namespace

`string`

##### key

`string`

#### Returns

[`KnowledgeRead`](../type-aliases/KnowledgeRead.md)

#### Implementation of

[`Knowledge`](../interfaces/Knowledge.md).[`get`](../interfaces/Knowledge.md#get)

***

### list()

> **list**(`scope`, `namespace`, `keyPrefix`): [`KnowledgeEntry`](../interfaces/KnowledgeEntry.md)[]

Current entries (tombstones included) whose key starts with `keyPrefix`, ordered by key.

#### Parameters

##### scope

`string`

##### namespace

`string`

##### keyPrefix

`string`

#### Returns

[`KnowledgeEntry`](../interfaces/KnowledgeEntry.md)[]

#### Implementation of

[`Knowledge`](../interfaces/Knowledge.md).[`list`](../interfaces/Knowledge.md#list)

***

### put()

> **put**(`scope`, `namespace`, `key`, `value`, `provenance`): [`KnowledgeEntry`](../interfaces/KnowledgeEntry.md)

#### Parameters

##### scope

`string`

##### namespace

`string`

##### key

`string`

##### value

`unknown`

##### provenance

[`KnowledgeProvenance`](../type-aliases/KnowledgeProvenance.md)

#### Returns

[`KnowledgeEntry`](../interfaces/KnowledgeEntry.md)

#### Implementation of

[`Knowledge`](../interfaces/Knowledge.md).[`put`](../interfaces/Knowledge.md#put)
