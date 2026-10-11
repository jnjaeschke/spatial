[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/runtime/import-revision](../README.md) / importRevisionInto

# Function: importRevisionInto()

> **importRevisionInto**(`repo`, `git`, `rev`, `opts?`): `Promise`\<\{ `base`: `string`; `head`: `string`; \}\>

`importRevision` for a repo and its read-only git capability; the session-free core also used by the `importRevision` task.

## Parameters

### repo

`string`

### git

`Pick`\<[`GitCapability`](../../../../../runtime/tasks/interfaces/GitCapability.md), `"resolve"`\>

### rev

[`PhabRevision`](../../../shared/phabricator/interfaces/PhabRevision.md)

### opts?

#### conduit?

[`Conduit`](../../phab-revision/type-aliases/Conduit.md)

## Returns

`Promise`\<\{ `base`: `string`; `head`: `string`; \}\>
