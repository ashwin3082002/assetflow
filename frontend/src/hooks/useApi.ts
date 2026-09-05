import { useEffect, useRef, useState } from 'react';

interface Settled<T> {
  key: string;
  data?: T;
  error?: unknown;
}

export interface ApiResult<T> {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  reload: () => void;
}

/**
 * Runs `fetcher` whenever `deps` change (compared by JSON value) and exposes loading / error / data.
 * A stale response never overwrites a newer one; `reload` refetches with the same deps.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[]): ApiResult<T> {
  const [version, setVersion] = useState(0);
  const key = `${JSON.stringify(deps)}#${version}`;

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [settled, setSettled] = useState<Settled<T>>({ key: '' });

  useEffect(() => {
    let cancelled = false;
    fetcherRef.current().then(
      (data) => {
        if (!cancelled) setSettled({ key, data });
      },
      (error: unknown) => {
        if (!cancelled) setSettled({ key, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  const isCurrent = settled.key === key;
  return {
    data: isCurrent ? settled.data : undefined,
    error: isCurrent ? settled.error : undefined,
    isLoading: !isCurrent,
    reload: () => setVersion((v) => v + 1),
  };
}
