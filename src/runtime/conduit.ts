import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type ConduitResponse<T> =
  | { error_code: string; error_info: string; result: null }
  | { error_code: null; error_info: null; result: T };

export class ConduitClient {
  #host: string;
  #token: string;
  #fetch: typeof fetch;

  constructor(host: string, token: string, fetchImpl: typeof fetch = globalThis.fetch) {
    this.#host = host;
    this.#token = token;
    this.#fetch = fetchImpl;
  }

  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const body = new URLSearchParams({ params: JSON.stringify(params), "api.token": this.#token });
    const response = await this.#fetch(`${this.#host}/api/${method}`, { method: "POST", body });
    if (!response.ok) throw new Error(`Conduit HTTP ${response.status} for ${method}`);

    const json = await response.json() as ConduitResponse<T>;
    if (json.error_code !== null) throw new Error(`Conduit ${method}: ${json.error_info}`);
    return json.result;
  }
}

/** Reads the Phabricator API token from ~/.arcrc or SPATIAL_ARCRC_PATH. */
export function readArcToken(host: string): string {
  const path = process.env.SPATIAL_ARCRC_PATH ?? join(homedir(), ".arcrc");
  const arcrc = JSON.parse(readFileSync(path, "utf8")) as { hosts?: Record<string, { token?: string }> };
  const apiHost = host.replace(/\/?$/, "/api/");
  const token = arcrc.hosts?.[apiHost]?.token;
  if (!token) throw new Error(`No arcrc token for ${host} (checked key "${apiHost}" in ${path})`);
  return token;
}
