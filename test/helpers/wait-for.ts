/** Waits until a synchronous or asynchronous poll returns a defined value. */
export async function waitFor<T>(fn: () => T | undefined | Promise<T | undefined>, ms = 5000, interval = 20, timeoutMessage = "timeout"): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await fn();
    if (value !== undefined) return value;
    if (interval === 0) await new Promise<void>((resolve) => setImmediate(resolve));
    else await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(timeoutMessage);
}
