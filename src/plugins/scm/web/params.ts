/** Sets or removes query parameters of the current URL without a new history entry; other parameters stay. */
export function setParams(params: Record<string, string | null>): void {
  const url = new URL(location.href);
  for (const [name, value] of Object.entries(params)) {
    if (value === null) url.searchParams.delete(name);
    else url.searchParams.set(name, value);
  }
  navigation.navigate(url.pathname + url.search + url.hash, { history: "replace" });
}
