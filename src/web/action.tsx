import { useCallback, useState } from "react";

/** Busy and error state of a user-triggered async action. `run` clears the error, sets busy, and records a rejection's message. */
export function useAction(): { busy: boolean; error: string | null; run<T>(action: () => Promise<T>): Promise<T | undefined>; fail(message: string): void; clear(): void } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(action: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try { return await action(); }
    catch (e) { setError((e as Error).message); return undefined; }
    finally { setBusy(false); }
  }, []);
  const clear = useCallback(() => setError(null), []);
  return { busy, error, run, fail: setError, clear };
}

/** An action's error, announced to screen readers. Renders nothing without an error. */
export function ErrorText({ error, testId }: { error: string | null | undefined; testId?: string }) {
  return error ? <p className="failed error-text" role="alert" data-testid={testId}>{error}</p> : null;
}
