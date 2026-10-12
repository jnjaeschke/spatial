[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/runtime/checks](../README.md) / parseWptMeta

# Function: parseWptMeta()

> **parseWptMeta**(`text`): `Map`\<`string`, [`WptSection`](../interfaces/WptSection.md)\>

Parses the `.ini` shape of `testing/web-platform/meta`: `[test]` sections, indented `[subtest]` sections (`\]` escapes a bracket), `expected: X`, `expected: [X, Y]` and `expected:` followed by indented `if …: X` lines and an optional bare default. Other keys and their blocks are ignored. Sections are keyed by name; a name that repeats merges.

## Parameters

### text

`string`

## Returns

`Map`\<`string`, [`WptSection`](../interfaces/WptSection.md)\>
