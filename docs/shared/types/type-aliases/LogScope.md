[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [shared/types](../README.md) / LogScope

# Type Alias: LogScope

> **LogScope** = \{ `kind`: `"all"`; \} \| \{ `kind`: `"branches"`; \} \| \{ `kind`: `"range"`; `range`: `string`; \}

Which commits a log page walks: every ref, local branches plus the remote default branch, or one revision range.
