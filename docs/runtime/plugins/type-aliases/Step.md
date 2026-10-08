[**spatial-ide**](../../../README.md)

***

[spatial-ide](../../../README.md) / [runtime/plugins](../README.md) / Step

# Type Alias: Step

> **Step** = \{ `input`: `unknown`; `run`: `string`; \} \| \{ `chosen?`: \{ `option`: `string`; `reason`: `string`; \}; `decide`: \{ `options`: [`DecisionOption`](../../../shared/types/interfaces/DecisionOption.md)[]; `question`: `string`; \}; \}

What a workflow does next: run a phase, or take a decision. A decision with `chosen` is made by a rule and stored already answered; without it the user is asked.
