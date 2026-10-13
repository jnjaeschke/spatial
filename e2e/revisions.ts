import { test } from "@playwright/test";

let revisionCount = 0;

/** Allocates unique fake Phabricator ids within one Playwright worker. */
export function newRevision(): { revision: number; d1: number; d2: number } {
  const revision = 1000 + test.info().workerIndex * 1000 + revisionCount++;
  return { revision, d1: revision * 10 + 1, d2: revision * 10 + 2 };
}
