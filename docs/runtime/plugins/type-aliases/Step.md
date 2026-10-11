[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/plugins](../README.md) / Step

# Type Alias: Step

> **Step** = \{ `input`: `unknown`; `run`: `string`; \} \| \{ `chosen?`: \{ `option`: `string`; `reason`: `string`; \}; `decide`: \{ `options`: [`DecisionOption`](../../../shared/types/interfaces/DecisionOption.md)[]; `question`: `string`; \}; `epoch?`: `number`; \}

What a workflow does next: run a phase, or take a decision. A decision with `chosen` is made by a rule and stored already answered; without it the user is asked. `epoch` is the epoch the decision is about (default: the latest); a workflow sets it when phases it does not own may have run since.
