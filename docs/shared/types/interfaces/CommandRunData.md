[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / CommandRunData

# Interface: CommandRunData

A shell command an agent ran (source fact; artifact `CommandRun`, verified). `test` is true when the profile's `isTestCommand` matches. `output` is capped at 256 KB.

## Properties

### command

> **command**: `string`

***

### durationMs

> **durationMs**: `number`

***

### exitCode

> **exitCode**: `number`

***

### output

> **output**: `string`

***

### test

> **test**: `boolean`
