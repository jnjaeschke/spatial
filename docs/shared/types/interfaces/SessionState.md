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

### plugins

> **plugins**: `Record`\<`string`, `unknown`\>

What plugins add to the snapshot (`Plugin.sessionState`), by plugin id; a plugin with nothing for the session has no entry.

***

### session

> **session**: [`Session`](Session.md)

***

### tasks

> **tasks**: [`TaskRecord`](TaskRecord.md)[]

***

### textLinks

> **textLinks**: [`TextLink`](TextLink.md)[]

Rules that turn text such as bug references into links, from the repository's plugins.
