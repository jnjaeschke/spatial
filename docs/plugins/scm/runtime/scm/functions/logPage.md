[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/scm/runtime/scm](../README.md) / logPage

# Function: logPage()

> **logPage**(`repo`, `scope`, `skip`, `limit`): `Promise`\<[`LogRow`](../../../../../shared/types/interfaces/LogRow.md)[]\>

One page of the topo-ordered log of `scope`, newest first; at most 500 rows.

## Parameters

### repo

`string`

### scope

[`LogScope`](../../../../../shared/types/type-aliases/LogScope.md)

### skip

`number`

### limit

`number`

## Returns

`Promise`\<[`LogRow`](../../../../../shared/types/interfaces/LogRow.md)[]\>
