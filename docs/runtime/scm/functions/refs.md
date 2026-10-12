[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/scm](../README.md) / refs

# Function: refs()

> **refs**(`repo`): `Promise`\<[`RefRow`](../../../shared/types/interfaces/RefRow.md)[]\>

Local branches, remote branches (without `<remote>/HEAD`), tags peeled to their commit, and this work tree's HEAD, each with its commit's committer date.

## Parameters

### repo

`string`

## Returns

`Promise`\<[`RefRow`](../../../shared/types/interfaces/RefRow.md)[]\>
