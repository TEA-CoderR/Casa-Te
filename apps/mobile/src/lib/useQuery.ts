// Small data-fetching hook with an in-memory cache (stale-while-revalidate), so we avoid an
// extra dependency. Refetch on screen focus with `useRefetchOnFocus`.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

const cache = new Map<string, unknown>();

export type QueryState<T> = {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  refetch: () => Promise<void>;
};

export function useQuery<T>(key: string | null, fn: () => Promise<T>): QueryState<T> {
  const [data, setData] = useState<T | undefined>(() => (key ? (cache.get(key) as T | undefined) : undefined));
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(key) && !cache.has(key ?? ''));
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const latest = useRef(0);

  const refetch = useCallback(async () => {
    if (!key) return;
    const ticket = ++latest.current;
    setLoading(!cache.has(key));
    try {
      const result = await fnRef.current();
      if (ticket !== latest.current) return;
      cache.set(key, result);
      setData(result);
      setError(null);
    } catch (e) {
      if (ticket === latest.current) setError(e);
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (!key) { setData(undefined); setLoading(false); return; }
    setData(cache.get(key) as T | undefined);
    void refetch();
  }, [key, refetch]);

  return { data, error, loading, refetch };
}

export function useRefetchOnFocus(refetch: () => unknown) {
  const first = useRef(true);
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    void refetch();
  }, [refetch]));
}

export function invalidate(prefix: string) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}
