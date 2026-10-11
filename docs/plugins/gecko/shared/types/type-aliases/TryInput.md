[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/gecko/shared/types](../README.md) / TryInput

# Type Alias: TryInput

> **TryInput** = \{ `base`: `string`; `head`: `string`; `llm?`: [`LlmSelection`](../../../../../shared/types/interfaces/LlmSelection.md); \} \| \{ `head`: `string`; `proposal`: [`TryProposalData`](../interfaces/TryProposalData.md); \}

Input of the `try` phase: from the implement workflow after Accept (the LLM proposes from `base..head`), or from chat with the proposal already made.
