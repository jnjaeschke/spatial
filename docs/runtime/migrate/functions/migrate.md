[**spatial**](../../../README.md)

***

[spatial](../../../README.md) / [runtime/migrate](../README.md) / migrate

# Function: migrate()

> **migrate**(`db`, `path`, `migrations`): `void`

Runs the pending `migrations` (version 0 is a fresh or pre-versioning database) and leaves `user_version` at `migrations.length`.
A database with data to change is first copied to `<path>.v<old>.bak`; each migration commits together with its version bump.

## Parameters

### db

`DatabaseSync`

### path

`string`

### migrations

readonly [`Migration`](../type-aliases/Migration.md)[]

## Returns

`void`
