[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/shared/phabricator](../README.md) / parseRevisionRef

# Function: parseRevisionRef()

> **parseRevisionRef**(`text`): \{ `host`: `string` \| `null`; `id`: `number`; \} \| `null`

Parses `D123` or `https://host/D123` (optional trailing slash); null for anything else, including `D0`. `host` is null when only the id is given.

## Parameters

### text

`string`

## Returns

\{ `host`: `string` \| `null`; `id`: `number`; \} \| `null`
