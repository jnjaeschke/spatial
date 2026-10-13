import type { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";

/**
 * Brings a database from schema version i to i+1, where i is the migration's index in its list. Migrations are never edited once released.
 * A migration that changes the shape of stored JSON (an artifact's data, a knowledge value) must rewrite the existing rows too.
 */
export type Migration = (db: DatabaseSync) => void;

export const schemaVersion = (db: DatabaseSync): number => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;

/** Throws unless the database is exactly at `latest`; for read-only opens, which never migrate. */
export function assertSchemaVersion(db: DatabaseSync, path: string, latest: number): void {
  const found = schemaVersion(db);
  if (found !== latest) throw new Error(`Database ${path} has schema version ${found}, expected ${latest}; restart spatial so its server migrates it`);
}

/**
 * Runs the pending `migrations` (version 0 is a fresh or pre-versioning database) and leaves `user_version` at `migrations.length`.
 * A database with data to change is first copied to `<path>.v<old>.bak`; each migration commits together with its version bump.
 */
export function migrate(db: DatabaseSync, path: string, migrations: readonly Migration[]): void {
  const from = schemaVersion(db);
  if (from > migrations.length) throw new Error(`Database ${path} was written by a newer spatial (schema version ${from}, this version knows ${migrations.length}); update spatial`);
  if (from === migrations.length) return;
  if (from > 0 && path !== ":memory:") db.exec(`VACUUM INTO '${freeBackupPath(path, from).replaceAll("'", "''")}'`);
  for (let i = from; i < migrations.length; i++) {
    db.exec("BEGIN IMMEDIATE");
    try {
      migrations[i](db);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function freeBackupPath(path: string, version: number): string {
  const base = `${path}.v${version}.bak`;
  let candidate = base;
  for (let n = 2; existsSync(candidate); n++) candidate = `${base}.${n}`;
  return candidate;
}
