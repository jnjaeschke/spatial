[**spatial-ide**](../../../../../README.md)

***

[spatial-ide](../../../../../README.md) / [plugins/review/shared/postable-comments](../README.md) / PostableComment

# Interface: PostableComment

## Properties

### body

> **body**: `string`

***

### comment

> **comment**: [`Artifact`](../../../../../shared/types/interfaces/Artifact.md)

Stable Phabricator-post identity: ReviewComment for findings, UserComment for local comments.

***

### lines?

> `optional` **lines?**: `object`

#### end

> **end**: `number`

#### path

> **path**: `string`

#### side

> **side**: `"new"` \| `"old"`

#### start

> **start**: `number`

***

### source

> **source**: [`Artifact`](../../../../../shared/types/interfaces/Artifact.md)
