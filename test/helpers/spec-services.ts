import type { Engine } from "../../src/plugins/spec/shared/types.ts";
import { missingCodeSearch, type CodeSearch } from "../../src/plugins/spec/runtime/code-search.ts";
import { searchfoxCodeSearch, type SearchfoxCapability } from "../../src/plugins/spec/runtime/searchfox.ts";
import type { SpecServices } from "../../src/plugins/spec/runtime/services.ts";
import type { WebspecCapability } from "../../src/plugins/spec/runtime/webspec.ts";

/** `RuntimeOptions.services` with fake spec services; what a test leaves out fails when used. Gecko code search wraps `searchfox`, engines without a fake fail loudly. */
export function specTestServices(opts: { webspec?: Partial<WebspecCapability>; searchfox?: Partial<SearchfoxCapability>; codeSearch?: Partial<Record<Engine, CodeSearch>> } = {}): { spec: SpecServices } {
  const searchfox = (opts.searchfox ?? {}) as SearchfoxCapability;
  return { spec: { webspec: (opts.webspec ?? {}) as WebspecCapability, searchfox, codeSearch: { gecko: searchfoxCodeSearch("gecko", searchfox), blink: missingCodeSearch("blink"), webkit: missingCodeSearch("webkit"), ...opts.codeSearch } } };
}
