import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImportRevisionError } from "./import-revision.ts";

function configError(repo: string, detail: string): ImportRevisionError {
  return new ImportRevisionError(
    `${detail}; give a URL like /review https://host/D123, or put phabricator.uri in ${join(repo, ".arcconfig")}`,
    "precondition",
  );
}

/** The Phabricator host for a revision: `explicit` when given, else `phabricator.uri` of `<repo>/.arcconfig` without trailing slashes. Throws `ImportRevisionError("precondition")` when neither yields an `http(s)://host`. */
export function resolveRevisionHost(repo: string, explicit: string | null): string {
  if (explicit !== null) return explicit;
  let raw: string;
  try {
    const config: unknown = JSON.parse(readFileSync(join(repo, ".arcconfig"), "utf8"));
    if (!config || typeof config !== "object" || !("phabricator.uri" in config) || typeof config["phabricator.uri"] !== "string") {
      throw configError(repo, "Missing or invalid phabricator.uri");
    }
    raw = config["phabricator.uri"].trim();
  } catch (error) {
    if (error instanceof ImportRevisionError) throw error;
    throw configError(repo, `Cannot read phabricator.uri from ${join(repo, ".arcconfig")}: ${(error as Error).message}`);
  }
  const host = raw.replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+$/.test(host)) throw configError(repo, `Invalid phabricator.uri in ${join(repo, ".arcconfig")}`);
  return host;
}
