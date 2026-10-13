[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/migrate](../README.md) / Migration

# Type Alias: Migration

> **Migration** = (`db`) => `void`

Brings a database from schema version i to i+1, where i is the migration's index in its list. Migrations are never edited once released.
A migration that changes the shape of stored JSON (an artifact's data, a knowledge value) must rewrite the existing rows too.

## Parameters

### db

`DatabaseSync`

## Returns

`void`
