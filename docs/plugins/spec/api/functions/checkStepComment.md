[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/spec/api](../README.md) / checkStepComment

# Function: checkStepComment()

> **checkStepComment**(`check`, `spec`, `steps`): [`StepProblem`](../type-aliases/StepProblem.md) \| `null`

Turns webspec-index's verdict on a Step comment into a finding (`spec` is `SPEC#anchor`, `steps` its algorithm): a mismatch
only when the comment text clearly describes another step (`describedStep`); a step the algorithm lacks is always reported.

## Parameters

### check

[`StepCommentCheck`](../../runtime/webspec/interfaces/StepCommentCheck.md)

### spec

`string`

### steps

[`SpecStep`](../../shared/steps/interfaces/SpecStep.md)[]

## Returns

[`StepProblem`](../type-aliases/StepProblem.md) \| `null`
