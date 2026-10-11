[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/spec/api](../README.md) / checkStepComment

# Function: checkStepComment()

> **checkStepComment**(`check`, `spec`, `steps`): [`StepProblem`](../type-aliases/StepProblem.md) \| `null`

Turns webspec-index's verdict on a Step comment into a finding (`spec` is `SPEC#anchor`, `steps` its algorithm).
Its mismatches include ranges ("to step 1.3"), explanations and relative numbering, so a mismatch is reported only
when the comment text clearly describes another step (a stale number); a step the algorithm lacks is always reported.

## Parameters

### check

[`StepCommentCheck`](../../../../runtime/tasks/interfaces/StepCommentCheck.md)

### spec

`string`

### steps

[`SpecStep`](../../shared/steps/interfaces/SpecStep.md)[]

## Returns

[`StepProblem`](../type-aliases/StepProblem.md) \| `null`
