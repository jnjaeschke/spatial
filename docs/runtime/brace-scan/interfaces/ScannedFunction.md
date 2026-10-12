[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/brace-scan](../README.md) / ScannedFunction

# Interface: ScannedFunction

A function found by brace scan: `line` names it (1-based), `end` holds its closing brace; `symbol` is the qualified name and parameter list (whitespace collapsed, so overloads differ), `signature` the trimmed text of `line`.

## Properties

### end

> **end**: `number`

***

### line

> **line**: `number`

***

### signature

> **signature**: `string`

***

### symbol

> **symbol**: `string`
