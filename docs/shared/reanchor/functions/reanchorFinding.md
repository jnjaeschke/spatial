[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [shared/reanchor](../README.md) / reanchorFinding

# Function: reanchorFinding()

> **reanchorFinding**(`input`, `next`): \{ `hunkId`: `string`; `lines?`: \{ `end`: `number`; `path`: `string`; `side`: `"old"` \| `"new"`; `start`: `number`; \}; \} \| `null`

Finds where a finding's code is in `next`.

## Parameters

### input

#### lines?

\{ `end`: `number`; `path`: `string`; `side`: `"old"` \| `"new"`; `start`: `number`; \}

#### lines.end

`number`

#### lines.path

`string`

#### lines.side

`"old"` \| `"new"`

#### lines.start

`number`

#### oldHunks

`object`[]

#### quote?

`string`

### next

[`DiffData`](../../types/interfaces/DiffData.md)

## Returns

\{ `hunkId`: `string`; `lines?`: \{ `end`: `number`; `path`: `string`; `side`: `"old"` \| `"new"`; `start`: `number`; \}; \} \| `null`
