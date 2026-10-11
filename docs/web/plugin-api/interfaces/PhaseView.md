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

## Methods

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
