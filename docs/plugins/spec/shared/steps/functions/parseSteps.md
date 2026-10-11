[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/spec/shared/steps](../README.md) / parseSteps

# Function: parseSteps()

> **parseSteps**(`markdown`): [`SpecStep`](../interfaces/SpecStep.md)[]

The steps of the first numbered algorithm in a section's markdown (webspec-index indents nested lists by 4 spaces); empty when the section has none. Indented lines that are not items, such as notes, continue the previous step.

## Parameters

### markdown

`string`

## Returns

[`SpecStep`](../interfaces/SpecStep.md)[]
