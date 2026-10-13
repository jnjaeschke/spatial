[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [web/plugin-api](../README.md) / PhaseView

# Interface: PhaseView

## Properties

### Body

> **Body**: `ComponentType`\<[`PhaseViewProps`](PhaseViewProps.md)\>

***

### commentsOnSelection?

> `optional` **commentsOnSelection?**: `boolean`

Whether selected diff lines can start a local inline comment.

***

### conversationOnCanvas?

> `optional` **conversationOnCanvas?**: `boolean`

Whether the view shows the session's main conversation itself; the footer then offers no session chip.

## Methods

### chipLabel()?

> `optional` **chipLabel**(`epoch`, `state`): `string`

Optional label for this phase's epoch chip.

#### Parameters

##### epoch

[`Epoch`](../../../shared/types/interfaces/Epoch.md)

##### state

[`SessionState`](../../../shared/types/interfaces/SessionState.md)

#### Returns

`string`

***

### exportable()?

> `optional` **exportable**(`state`): `boolean`

Whether the Export button shows; default false.

#### Parameters

##### state

[`SessionState`](../../../shared/types/interfaces/SessionState.md)

#### Returns

`boolean`

***

### exportDiff()?

> `optional` **exportDiff**(`state`): [`ExportDiff`](ExportDiff.md) \| `null`

The diff an export carries file texts of; none for views without diffs.

#### Parameters

##### state

[`SessionState`](../../../shared/types/interfaces/SessionState.md)

#### Returns

[`ExportDiff`](ExportDiff.md) \| `null`

***

### exportSummary()?

> `optional` **exportSummary**(`state`): `string`[]

Extra contents summary lines for a static export.

#### Parameters

##### state

[`SessionState`](../../../shared/types/interfaces/SessionState.md)

#### Returns

`string`[]

***

### exportTasks()?

> `optional` **exportTasks**(`task`): `boolean`

Which tasks this view includes in a static export; tasks are omitted by default because inputs can contain prompts.

#### Parameters

##### task

[`TaskRecord`](../../../shared/types/interfaces/TaskRecord.md)

#### Returns

`boolean`

***

### isStaleNotice()?

> `optional` **isStaleNotice**(`state`, `notice`): `boolean`

Whether a notification is stale for this view and is not shown.

#### Parameters

##### state

[`SessionState`](../../../shared/types/interfaces/SessionState.md)

##### notice

[`NotifyPayload`](../../../shared/types/interfaces/NotifyPayload.md)

#### Returns

`boolean`
