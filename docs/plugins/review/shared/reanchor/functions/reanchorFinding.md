[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/shared/reanchor](../README.md) / reanchorFinding

# Function: reanchorFinding()

> **reanchorFinding**(`input`, `next`): \{ `hunkId`: `string`; `lines?`: \{ `end`: `number`; `path`: `string`; `side`: `"new"` \| `"old"`; `start`: `number`; \}; \} \| `null`

Finds where a finding's code is in `next`.

## Parameters

### input

#### lines?

\{ `end`: `number`; `path`: `string`; `side`: `"new"` \| `"old"`; `start`: `number`; \}

#### lines.end

`number`

#### lines.path

`string`

#### lines.side

`"new"` \| `"old"`

#### lines.start

`number`

#### oldHunks

`object`[]

#### quote?

`string`

### next

[`DiffData`](../../../../../shared/types/interfaces/DiffData.md)

## Returns

\{ `hunkId`: `string`; `lines?`: \{ `end`: `number`; `path`: `string`; `side`: `"new"` \| `"old"`; `start`: `number`; \}; \} \| `null`
