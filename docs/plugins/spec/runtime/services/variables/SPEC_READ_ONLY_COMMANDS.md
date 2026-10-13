[**spatial**](../../../../../README.md)

***

[spatial](../../../../../README.md) / [plugins/spec/runtime/services](../README.md) / SPEC\_READ\_ONLY\_COMMANDS

# Variable: SPEC\_READ\_ONLY\_COMMANDS

> `const` **SPEC\_READ\_ONLY\_COMMANDS**: `string`[]

What a read-only LLM run may execute: searchfox-cli, chromium-search (every subcommand reads), and webspec-index's query subcommands (not `update`, `reparse` or `clear-db`, which rewrite its index).
