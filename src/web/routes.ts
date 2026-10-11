/** The Navigation API, absent where the browser does not expose it (it can be disabled); without it app links load the page. */
export const nav: Navigation | undefined = (globalThis as { navigation?: Navigation }).navigation;

/** Goes to an app URL: same-document with the Navigation API, else a page load. */
export function navigateTo(url: string): void {
  if (nav) nav.navigate(url);
  else location.assign(url);
}

export type Route = { kind: "picker" } | { kind: "repo"; path: string } | { kind: "session"; sessionId: string; place: string | null } | { kind: "fixture" };

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
