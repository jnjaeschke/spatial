import { existsSync } from "node:fs";
import { join } from "node:path";

export function isGeckoRepo(repo: string): boolean {
  return existsSync(join(repo, "mach")) && existsSync(join(repo, "moz.build"));
}
