[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [mcp/scm-tools](../README.md) / scmLog

# Function: scmLog()

> **scmLog**(`repo`, `range`, `opts?`): `Promise`\<`string`\>

`search` and `regex` select commits whose diff changes the number of occurrences of a string (`git log -S`) or touches a line matching a regex (`git log -G`).

## Parameters

### repo

`string`

### range

`string`

### opts?

#### limit?

`number`

#### path?

`string`

#### regex?

`string`

#### search?

`string`

## Returns

`Promise`\<`string`\>
