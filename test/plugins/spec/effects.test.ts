import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stepEffects } from "../../../src/plugins/spec/shared/effects.ts";
import type { SpecEffect, SpecHop } from "../../../src/shared/types.ts";

const here = { spec: "HTML", anchor: "navigate" };
const effect = (id: string, location: SpecEffect["location"], other: SpecEffect["other_locations"] = []): SpecEffect => ({ id, kind: "fire_event", params: { name: id }, execution: ["inline"], location, other_locations: other });
const hop = (from: SpecHop["from"], to: SpecHop["to"], site: SpecHop["site"]): SpecHop => ({ from, to, site });

test("effects located in the algorithm attach to their own step", () => {
  const out = stepEffects([effect("load", { ...here, step_path: [3], url: "u" }), effect("elsewhere", { spec: "FETCH", anchor: "fetch", step_path: [1], url: "u" })], null, here);
  assert.deepEqual(out, { 3: [{ effectId: "load", via: "direct" }] });
});

test("a path attaches where control leaves the algorithm, past continuation hops", () => {
  const witness = [hop(here, { ...here, step_path: [8] }, { ...here, step_path: [8] }), hop({ ...here, step_path: [8] }, { spec: "FETCH", anchor: "fetch" }, { ...here, step_path: [24, 1] })];
  const out = stepEffects([effect("deep", { spec: "FETCH", anchor: "fetch", url: "u" })], [{ effectId: "deep", witnesses: [witness, witness] }], here);
  assert.deepEqual(out, { "24.1": [{ effectId: "deep", via: "path" }] });
});

test("direct effects come before path effects on a step; unknown effect ids are ignored", () => {
  const witness = [hop(here, { spec: "FETCH", anchor: "fetch" }, { ...here, step_path: [1] })];
  const out = stepEffects([effect("a", { spec: "FETCH", anchor: "fetch", url: "u" }), effect("b", { ...here, step_path: [1], url: "u" })], [{ effectId: "a", witnesses: [witness] }, { effectId: "zzz", witnesses: [witness] }], here);
  assert.deepEqual(out["1"]!.map((e) => e.effectId), ["b", "a"]);
});

test("HTML#navigate fixture: steps with effects", () => {
  const raw = JSON.parse(readFileSync(new URL("../../fixtures/webspec/navigate-effects.json", import.meta.url), "utf8"));
  const explanations = raw.explanations.map((e: any) => ({ effectId: e.effect_id, witnesses: e.witnesses.map((w: any) => w.hops.map((h: any) => ({ from: h.from, to: h.to, site: h.site.subject }))) }));
  const out = stepEffects(raw.effects, explanations, here);
  assert.deepEqual(Object.keys(out).sort(), ["15.1", "20", "21.2", "22.4", "24", "24.1", "24.3", "24.9", "24.9.1", "8"]);
  assert.deepEqual(out["24.9.1"]![0], { effectId: "ef_729af2c0780d9303", via: "direct" });
  assert.ok(out["22.4"]!.some((e) => e.effectId === "ef_e6c5f8c3e2980985" && e.via === "path"));
});
