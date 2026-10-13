[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/git/read](../README.md) / fileLines

# Function: fileLines()

> **fileLines**(`repo`, `rev`, `path`, `signal?`): `Promise`\<`string`[]\>

The lines of `path` at `rev`; rejects a `rev` or `path` that git could read as an option or that leaves the repository.

## Parameters

### repo

`string`

### rev

`string`

### path

`string`

### signal?

`AbortSignal`

## Returns

`Promise`\<`string`[]\>
