[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / CommitDetail

# Interface: CommitDetail

One commit of a log page. `date` is the author date, ISO 8601.

## Extends

- [`LogRow`](LogRow.md)

## Properties

### author

> **author**: `string`

#### Inherited from

[`LogRow`](LogRow.md).[`author`](LogRow.md#author)

***

### body

> **body**: `string`

***

### committer

> **committer**: `string`

***

### committerDate

> **committerDate**: `string`

***

### date

> **date**: `string`

#### Inherited from

[`LogRow`](LogRow.md).[`date`](LogRow.md#date)

***

### email

> **email**: `string`

#### Inherited from

[`LogRow`](LogRow.md).[`email`](LogRow.md#email)

***

### files

> **files**: [`CommitFileStat`](CommitFileStat.md)[]

***

### parents

> **parents**: `string`[]

#### Inherited from

[`LogRow`](LogRow.md).[`parents`](LogRow.md#parents)

***

### sha

> **sha**: `string`

#### Inherited from

[`LogRow`](LogRow.md).[`sha`](LogRow.md#sha)

***

### subject

> **subject**: `string`

#### Inherited from

[`LogRow`](LogRow.md).[`subject`](LogRow.md#subject)
