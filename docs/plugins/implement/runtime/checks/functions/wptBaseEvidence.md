[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/implement/runtime/checks](../README.md) / wptBaseEvidence

# Function: wptBaseEvidence()

> **wptBaseEvidence**(`meta`, `subtests`): \{ `evidence`: `string`; \} \| \{ `problem`: `string`; \}

Whether the metadata expects a failure at the base for the named subtests (each one), or, with none named, for the test as a whole or for at least one subtest. `evidence` is the line shown to the user; when every failing expectation is conditional, the conditions are part of it.

## Parameters

### meta

`Map`\<`string`, [`WptSection`](../interfaces/WptSection.md)\>

### subtests

`string`[]

## Returns

\{ `evidence`: `string`; \} \| \{ `problem`: `string`; \}
