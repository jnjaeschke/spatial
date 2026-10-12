import { createContext } from "react";

export type Route = { kind: "picker" } | { kind: "repo"; path: string } | { kind: "session"; sessionId: string; place: string | null } | { kind: "fixture" };

/** What the live session view offers its canvas: the session the URL belongs to and the page title. */
export const RouteContext = createContext<{ sessionId: string; setTitleParts(parts: string[]): void } | null>(null);

/** Parses a browser URL as an app route, or returns null for paths owned elsewhere. */
export function parseRoute(url: URL): Route | null {
  if (url.pathname === "/") return url.searchParams.has("fixture") ? { kind: "fixture" } : { kind: "picker" };
  if (url.pathname === "/repo") {
    const path = url.searchParams.get("path");
    return path ? { kind: "repo", path } : null;
  }
  const match = /^\/sessions\/([^/]+)(?:\/(.*))?$/.exec(url.pathname);
  if (!match) return null;
  try {
    const sessionId = decodeURIComponent(match[1]!);
    if (!sessionId) return null;
    if (match[2] === undefined || match[2] === "") return { kind: "session", sessionId, place: null };
    return { kind: "session", sessionId, place: match[2].split("/").map(decodeURIComponent).join(":") };
  } catch {
    return null;
  }
}

/** Formats an app route as a same-origin path and query. */
export function routeUrl(route: Route): string {
  if (route.kind === "picker" || route.kind === "fixture") return route.kind === "fixture" ? "/?fixture=1" : "/";
  if (route.kind === "repo") return `/repo?path=${encodeURIComponent(route.path)}`;
  const base = `/sessions/${encodeURIComponent(route.sessionId)}`;
  return route.place === null ? base : `${base}/${route.place.split(":").map(encodeURIComponent).join("/")}`;
}

/** The session view a session URL names (`?view=`), or null for the phase view. */
export function sessionViewOf(url: URL): string | null {
  return url.searchParams.get("view");
}

/** `url` as path, query and hash with the session view set, or removed for null. */
export function withSessionView(url: URL, view: string | null, params: Record<string, string> = {}): string {
  const next = new URL(url);
  if (view === null) next.searchParams.delete("view");
  else next.searchParams.set("view", view);
  for (const [name, value] of Object.entries(params)) next.searchParams.set(name, value);
  return next.pathname + next.search + next.hash;
}

/** Shows a session view (null: the phase view) as a new history entry. */
export function showSessionView(view: string | null, params: Record<string, string> = {}): void {
  navigation.navigate(withSessionView(new URL(location.href), view, params));
}
