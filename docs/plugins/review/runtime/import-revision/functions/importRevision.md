[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/review/runtime/import-revision](../README.md) / importRevision

# Function: importRevision()

> **importRevision**(`rt`, `sessionId`, `rev`, `opts?`): `Promise`\<\{ `base`: `string`; `head`: `string`; \}\>

Rebuilds a Phabricator revision stack as commits and returns the range to review.
Only reads Conduit and writes objects plus refs under `refs/spatial/`; it never
changes the work tree, index, HEAD, or branches, and never fetches.

## Parameters

### rt

[`Runtime`](../../../../../runtime/tasks/classes/Runtime.md)

### sessionId

`string`

### rev

[`PhabRevision`](../../../shared/phabricator/interfaces/PhabRevision.md)

### opts?

#### conduit?

[`Conduit`](../../phab-revision/type-aliases/Conduit.md)

## Returns

`Promise`\<\{ `base`: `string`; `head`: `string`; \}\>
