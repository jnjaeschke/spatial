[**spatial**](../../../../README.md)

***

[spatial](../../../../README.md) / [plugins/review/api](../README.md) / RoundSource

# Type Alias: RoundSource

> **RoundSource** = \{ `host`: `string`; `kind`: `"phabricator"`; `stack`: [`RoundEntry`](../interfaces/RoundEntry.md)[]; \} \| \{ `base`: `string`; `head`: `string`; `host`: `string` \| `null`; `kind`: `"local"`; `phab`: [`RoundEntry`](../interfaces/RoundEntry.md)[] \| `null`; \}

A Phabricator stack rebuilt from its root, or local commits with optional revision matches.
