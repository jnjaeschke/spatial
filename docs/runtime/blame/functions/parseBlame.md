[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/blame](../README.md) / parseBlame

# Function: parseBlame()

> **parseBlame**(`porcelain`, `fallbackPath?`): [`BlameEntry`](../../tasks/interfaces/BlameEntry.md)[]

Parses `git blame --porcelain`; `fallbackPath` is used when porcelain omits a filename.

## Parameters

### porcelain

`string`

### fallbackPath?

`string` = `""`

## Returns

[`BlameEntry`](../../tasks/interfaces/BlameEntry.md)[]
