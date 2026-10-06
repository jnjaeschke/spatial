[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/revision-host](../README.md) / resolveRevisionHost

# Function: resolveRevisionHost()

> **resolveRevisionHost**(`repo`, `explicit`): `string`

The Phabricator host for a revision: `explicit` when given, else `phabricator.uri` of `<repo>/.arcconfig` without trailing slashes. Throws `ImportRevisionError("precondition")` when neither yields an `http(s)://host`.

## Parameters

### repo

`string`

### explicit

`string` \| `null`

## Returns

`string`
