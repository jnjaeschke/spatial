import assert from "node:assert/strict";
import test from "node:test";
import { parseRoute, routeUrl, sessionViewOf, withSessionView, type Route } from "../../src/web/routes.ts";

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

test("session views live in the view query parameter", () => {
  assert.equal(sessionViewOf(new URL("http://x/sessions/s1/patch/0?view=spec")), "spec");
  assert.equal(sessionViewOf(new URL("http://x/sessions/s1")), null);
  assert.equal(withSessionView(new URL("http://x/sessions/s1/patch/0#h"), "spec"), "/sessions/s1/patch/0?view=spec#h");
  assert.equal(withSessionView(new URL("http://x/sessions/s1?view=spec&a=1"), null), "/sessions/s1?a=1");
  assert.deepEqual(parseRoute(new URL("http://x/sessions/s1/patch/0?view=spec")), { kind: "session", sessionId: "s1", place: "patch:0" });
});

test("session views can carry parameters", () => {
  assert.equal(withSessionView(new URL("http://x/sessions/s1?view=spec"), "impl", { ref: "HTML#navigate" }), "/sessions/s1?view=impl&ref=HTML%23navigate");
});
