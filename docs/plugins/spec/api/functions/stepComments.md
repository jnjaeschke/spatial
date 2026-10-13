[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/spec/api](../README.md) / stepComments

# Function: stepComments()

> **stepComments**(`webspec`, `path`, `text`, `added`, `signal`): `Promise`\<[`StepCommentCheck`](../../runtime/webspec/interfaces/StepCommentCheck.md)[]\>

webspec-index's checks of a file's Step comments; none (and no analysis) unless an `added` line (1-based) looks like one.

## Parameters

### webspec

[`WebspecCapability`](../../runtime/webspec/interfaces/WebspecCapability.md)

### path

`string`

### text

`string`

### added

`Iterable`\<`number`\>

### signal

`AbortSignal`

## Returns

`Promise`\<[`StepCommentCheck`](../../runtime/webspec/interfaces/StepCommentCheck.md)[]\>
