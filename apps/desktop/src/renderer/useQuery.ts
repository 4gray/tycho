import { useCallback, useEffect, useState } from 'react';

/** Minimal fetch-and-refresh hook; re-runs whenever main reports a change. */
export function useTycho<T>(load: () => Promise<T>, deps: unknown[] = []): { data: T | undefined; error: Error | undefined } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => load().then(setData, setError), deps);
  useEffect(() => {
    void run();
    return window.tycho.onChange(() => void run());
  }, [run]);
  return { data, error };
}
