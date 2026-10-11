[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/spec/shared/types](../README.md) / EngineMapping

# Interface: EngineMapping

Knowledge value under `spec` / `impl|<engine>|<SPEC#anchor>`: an algorithm's sites and tests in one engine at revision `rev` of `repoBase`; `rejected` are proposals the user rejected, never proposed again.

## Properties

### checkedAt

> **checkedAt**: `string`

***

### engine

> **engine**: [`Engine`](../../../../../shared/types/type-aliases/Engine.md)

***

### rejected

> **rejected**: `Pick`\<[`EngineSite`](EngineSite.md), `"symbol"` \| `"path"` \| `"line"` \| `"signature"`\>[]

***

### repoBase

> **repoBase**: `string`

***

### rev

> **rev**: `string`

***

### sites

> **sites**: [`EngineSite`](EngineSite.md)[]

***

### tests

> **tests**: [`EngineTest`](EngineTest.md)[]
