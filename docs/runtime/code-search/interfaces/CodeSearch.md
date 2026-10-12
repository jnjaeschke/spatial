[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/code-search](../README.md) / CodeSearch

# Interface: CodeSearch

Read-only code search over one engine's source tree at its current revision: the calls an engine mapping makes. `pinned`: `tip().rev` fixes the files' contents (false for a branch name). `heuristicScopes`: `functionAt` is a brace scan, not a code index.

## Properties

### effect

> `readonly` **effect**: `"read-only"`

***

### engine

> `readonly` **engine**: [`Engine`](../../../shared/types/type-aliases/Engine.md)

***

### heuristicScopes

> `readonly` **heuristicScopes**: `boolean`

***

### pinned

> `readonly` **pinned**: `boolean`

## Methods

### file()

> **file**(`path`, `signal`): `Promise`\<`string` \| `null`\>

A file's text at the current revision; null when it does not exist. Network.

#### Parameters

##### path

`string`

##### signal

`AbortSignal`

#### Returns

`Promise`\<`string` \| `null`\>

***

### functionAt()

> **functionAt**(`path`, `line`, `signal`): `Promise`\<[`CodeScope`](../../../shared/types/interfaces/CodeScope.md)[]\>

The scopes enclosing a line, innermost first; empty outside every function and type. Network.

#### Parameters

##### path

`string`

##### line

`number`

##### signal

`AbortSignal`

#### Returns

`Promise`\<[`CodeScope`](../../../shared/types/interfaces/CodeScope.md)[]\>

***

### search()

> **search**(`query`, `signal`, `limit?`): `Promise`\<`object`[]\>

Lines whose text matches `query`, at most `limit` (default 30). Network.

#### Parameters

##### query

`string`

##### signal

`AbortSignal`

##### limit?

`number`

#### Returns

`Promise`\<`object`[]\>

***

### specRefs()

> **specRefs**(`url`, `signal`, `limit?`): `Promise`\<[`GeckoSpecRef`](../../../shared/types/interfaces/GeckoSpecRef.md)[]\>

Lines linking a spec section, at most `limit` (default 30), grouped `Code` or a test group. The fragment may be matched as a prefix: callers check each line. Network.

#### Parameters

##### url

`string`

##### signal

`AbortSignal`

##### limit?

`number`

#### Returns

`Promise`\<[`GeckoSpecRef`](../../../shared/types/interfaces/GeckoSpecRef.md)[]\>

***

### tip()

> **tip**(): `Promise`\<\{ `repoBase`: `string`; `rev`: `string`; \}\>

Permalink base and the current revision, cached for up to an hour, so `file` may already read a newer one. Network.

#### Returns

`Promise`\<\{ `repoBase`: `string`; `rev`: `string`; \}\>
