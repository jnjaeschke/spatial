[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/gecko/runtime/try-watcher](../README.md) / parseTreeherderJson

# Function: parseTreeherderJson()

> **parseTreeherderJson**(`stdout`): `object`

Failing jobs from `treeherder-cli <url> --json`. Versions before 0.3.0 print plain text when nothing failed.

## Parameters

### stdout

`string`

## Returns

`object`

### failures

> **failures**: [`TryFailure`](../../../shared/types/interfaces/TryFailure.md)[]

### pushId

> **pushId**: `number`

### revision

> **revision**: `string`
