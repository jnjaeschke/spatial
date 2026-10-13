import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { specServices, specServicesFromEnv } from "../../../src/plugins/spec/runtime/services.ts";
import { specPlugin } from "../../../src/plugins/spec/index.ts";

const stub = (name: string) => fileURLToPath(new URL(`../../stubs/${name}`, import.meta.url));

test("specServices throws when the holder has no spec services", () => {
  assert.throws(() => specServices({ services: {} }), /Spec services are not available/);
  const services = specServicesFromEnv({});
  assert.equal(specServices({ services: { spec: services } }), services);
});

test("specServicesFromEnv takes the tool binaries from SPATIAL_*_BIN", async () => {
  const services = specServicesFromEnv({ SPATIAL_WEBSPEC_BIN: stub("fake-webspec.mjs"), SPATIAL_SEARCHFOX_BIN: stub("fake-searchfox.mjs"), SPATIAL_CHROMIUM_SEARCH_BIN: stub("fake-chromium-search.mjs") });
  const signal = new AbortController().signal;
  assert.equal((await services.webspec.resolve("https://html.spec.whatwg.org/#navigate", signal)).found, true);
  assert.ok((await services.searchfox.tip()).rev);
  assert.deepEqual(Object.keys(services.codeSearch).sort(), ["blink", "gecko", "webkit"]);
  assert.ok((await services.codeSearch.blink.tip()).rev);
});

test("the spec plugin builds its services from the environment and lists its read-only commands", () => {
  assert.ok(specPlugin.services({}));
  assert.deepEqual(specPlugin.readOnlyCommands, ["searchfox-cli", "chromium-search", ...["query", "search", "refs", "anchors", "idl", "trace", "effects", "exists"].map((sub) => `webspec-index ${sub}`)]);
});
