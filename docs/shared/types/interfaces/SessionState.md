[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / SessionState

# Interface: SessionState

Full snapshot of one session; the web client's only data source besides events.

## Properties

### artifacts

> **artifacts**: [`Artifact`](Artifact.md)\<`unknown`\>[]

***

### epochs

> **epochs**: [`Epoch`](Epoch.md)[]

***

### lastEventId

> **lastEventId**: `number`

Subscribe to events after this id to miss nothing.

***

### links

> **links**: [`Link`](Link.md)[]

***

### searchfox

> **searchfox**: \{ `repoBase`: `string`; `tipRev`: `string`; \} \| `null`

Searchfox repository base and indexed tip for Gecko repos, else null.

***

### session

> **session**: [`Session`](Session.md)

***

### tasks

> **tasks**: [`TaskRecord`](TaskRecord.md)[]
