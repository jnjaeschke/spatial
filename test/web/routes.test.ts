import assert from "node:assert/strict";
import test from "node:test";
import { parseRoute, routeUrl, type Route } from "../../src/web/routes.ts";

const routes: Route[] = [
  { kind: "picker" },
  { kind: "repo", path: "/a b/c" },
  { kind: "session", sessionId: "s1", place: null },
  { kind: "session", sessionId: "s1", place: "change:c3" },
  { kind: "fixture" },
];

test("app routes round-trip through URLs", () => {
  for (const route of routes) {
    const url = new URL(routeUrl(route), "http://localhost");
    assert.deepEqual(parseRoute(url), route);
  }
});

test("place segments are encoded independently", () => {
  const route: Route = { kind: "session", sessionId: "s/1", place: "part/a#b" };
  assert.equal(routeUrl(route), "/sessions/s%2F1/part%2Fa%23b");
  assert.deepEqual(parseRoute(new URL(routeUrl(route), "http://localhost")), route);
});

test("unknown and incomplete paths are not app routes", () => {
  assert.equal(parseRoute(new URL("http://localhost/api/x")), null);
  assert.equal(parseRoute(new URL("http://localhost/sessions/")), null);
});
