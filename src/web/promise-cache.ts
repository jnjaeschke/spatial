/** A loader that shares one `load()` promise per key while the page lives; a rejected one is dropped so the next call retries. */
export function promiseCache<T>(): (key: string, load: () => Promise<T>) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return (key, load) => {
    let promise = cache.get(key);
    if (!promise) {
      promise = load();
      promise.catch(() => cache.delete(key));
      cache.set(key, promise);
    }
    return promise;
  };
}
