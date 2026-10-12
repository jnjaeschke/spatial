[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/runtime/checks](../README.md) / verifyChecks

# Function: verifyChecks()

> **verifyChecks**(`checks`, `show`, `added?`): `Promise`\<\{ `dropped`: `string`[]; `verified`: [`AcceptanceCheck`](../../../shared/types/type-aliases/AcceptanceCheck.md)[]; \}\>

Checks each check against the base: a `new-test` path must not exist; a `covering-test` or `failing-test` path must (a `covering-test` may also name a path in `added`, the files earlier steps add); a web-platform `failing-test` needs metadata that expects its failure and gets `baseEvidence`; a `measure` needs a command and a goal. Invalid checks are dropped with a reason. `show` reads a file at the base and rejects when it is missing.

## Parameters

### checks

[`AcceptanceCheck`](../../../shared/types/type-aliases/AcceptanceCheck.md)[]

### show

(`path`) => `Promise`\<`string`\>

### added?

`ReadonlySet`\<`string`\> = `...`

## Returns

`Promise`\<\{ `dropped`: `string`[]; `verified`: [`AcceptanceCheck`](../../../shared/types/type-aliases/AcceptanceCheck.md)[]; \}\>
