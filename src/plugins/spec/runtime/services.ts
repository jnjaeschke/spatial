import type { Engine } from "../shared/types.ts";
import { makeChromiumSearch } from "./chromium-search.ts";
import type { CodeSearch } from "./code-search.ts";
import { makeSearchfox, searchfoxCodeSearch, type SearchfoxCapability } from "./searchfox.ts";
import { makeWebspec, type WebspecCapability } from "./webspec.ts";

/** What the spec plugin offers through `Plugin.services`: web-spec lookup and the code search of every engine. */
export interface SpecServices { webspec: WebspecCapability; searchfox: SearchfoxCapability; codeSearch: Record<Engine, CodeSearch> }

/** Builds the services with tool binaries from `SPATIAL_WEBSPEC_BIN`, `SPATIAL_SEARCHFOX_BIN` and `SPATIAL_CHROMIUM_SEARCH_BIN` (the tools' names on `PATH` when unset). Gecko searches over searchfox, WebKit over searchfox's `wubkat` repository, Blink over chromium-search. */
export function specServicesFromEnv(env: Readonly<Record<string, string | undefined>>): SpecServices {
  const searchfoxBin = env.SPATIAL_SEARCHFOX_BIN || undefined;
  const searchfox = makeSearchfox({ bin: searchfoxBin });
  return {
    webspec: makeWebspec({ bin: env.SPATIAL_WEBSPEC_BIN || undefined }),
    searchfox,
    codeSearch: { gecko: searchfoxCodeSearch("gecko", searchfox), webkit: searchfoxCodeSearch("webkit", makeSearchfox({ bin: searchfoxBin, repo: "wubkat" })), blink: makeChromiumSearch({ bin: env.SPATIAL_CHROMIUM_SEARCH_BIN || undefined }) },
  };
}

/** The spec services of a runtime or task context; throws when the spec plugin is not registered. */
export function specServices(holder: { services: Readonly<Record<string, unknown>> }): SpecServices {
  const services = holder.services.spec;
  if (!services) throw new Error("Spec services are not available");
  return services as SpecServices;
}

/** What a read-only LLM run may execute: searchfox-cli, chromium-search (every subcommand reads), and webspec-index's query subcommands (not `update`, `reparse` or `clear-db`, which rewrite its index). */
export const SPEC_READ_ONLY_COMMANDS = ["searchfox-cli", "chromium-search", ...["query", "search", "refs", "anchors", "idl", "trace", "effects", "exists"].map((sub) => `webspec-index ${sub}`)];
