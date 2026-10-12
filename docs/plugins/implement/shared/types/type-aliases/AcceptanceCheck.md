[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/shared/types](../README.md) / AcceptanceCheck

# Type Alias: AcceptanceCheck

> **AcceptanceCheck** = \{ `kind`: `"new-test"`; `path`: `string`; \} \| \{ `baseEvidence?`: `string`; `kind`: `"failing-test"`; `path`: `string`; `subtests`: `string`[]; \} \| \{ `kind`: `"covering-test"`; `path`: `string`; \} \| \{ `command`: `string`; `goal`: `string`; `kind`: `"measure"`; \}

What shows that a plan step works. `new-test`: a test file the plan adds (absent at the base; fails before the fix, passes after). `failing-test`: an existing test that fails at the base and passes after; `baseEvidence` is set by the runtime for a web-platform test from its metadata. `covering-test`: an existing test that must still pass; a later step may name a file an earlier step adds. `measure`: a command run before and after; the user judges the numbers against `goal`.
