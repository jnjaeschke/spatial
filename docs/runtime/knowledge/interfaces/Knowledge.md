[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/knowledge](../README.md) / Knowledge

# Interface: Knowledge

Plugin data that outlives a task run. `scope` is `"global"`, a repository identity (`RepoInfo.repoDir`), or `session:<id>` for data of one session; `namespace` is the plugin id.
Nothing is deleted: `put` supersedes the current entry of its key, and a `null` value is a tombstone.

## Methods

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

***

### list()

> **list**(`scope`, `namespace`, `keyPrefix`): [`KnowledgeEntry`](KnowledgeEntry.md)[]

Current entries (tombstones included) whose key starts with `keyPrefix`, ordered by key.

#### Parameters

##### scope

`string`

##### namespace

`string`

##### keyPrefix

`string`

#### Returns

[`KnowledgeEntry`](KnowledgeEntry.md)[]

***

### put()

> **put**(`scope`, `namespace`, `key`, `value`, `provenance`): [`KnowledgeEntry`](KnowledgeEntry.md)

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

[`KnowledgeEntry`](KnowledgeEntry.md)
