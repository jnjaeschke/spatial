[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/blame](../README.md) / parseBlameLines

# Function: parseBlameLines()

> **parseBlameLines**(`porcelain`, `fallbackPath?`): [`BlameLine`](../interfaces/BlameLine.md)[]

Parses `git blame --porcelain` or `--line-porcelain` into one entry per line; `fallbackPath` is used when the output omits a filename.

## Parameters

### porcelain

`string`

### fallbackPath?

`string` = `""`

## Returns

[`BlameLine`](../interfaces/BlameLine.md)[]
