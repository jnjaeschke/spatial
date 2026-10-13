[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [runtime/git/read](../README.md) / makeGit

# Function: makeGit()

> **makeGit**(`repo`, `signal?`): [`GitCapability`](../../../tasks/interfaces/GitCapability.md)

Read-only git access to `repo`; with a `signal`, aborting it kills the running git process and rejects the call in flight.

## Parameters

### repo

`string`

### signal?

`AbortSignal`

## Returns

[`GitCapability`](../../../tasks/interfaces/GitCapability.md)
